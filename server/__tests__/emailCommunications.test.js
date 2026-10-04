import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { previewCampaignAudience } from '../emailAudienceService.js';
import { evaluateRecipientEligibility, recordMarketingOptIn, recordSuppression, recordUnsubscribe } from '../emailConsentService.js';
import { createCampaign, getCampaign } from '../emailCampaignService.js';
import {
  cancelCampaignJobs,
  claimNextOutboxJob,
  dispatchOutboxJob,
  enqueueCampaign,
  processClaimedJob,
  readPreferenceToken,
  signPreferenceToken,
  startCampaignSend,
} from '../emailOutboxService.js';
import { ingestResendWebhook } from '../emailWebhookService.js';
import { verifyResendWebhook } from '../emailResendAdapter.js';
import {
  addResourceVersion,
  createEventResource,
  resolveResourceAccess,
  revokeRegistrationGrants,
  setResourcePublished,
} from '../eventResourceService.js';
import { resolveRouteAdminPermission } from '../rbacService.js';
import { permissionMatches } from '../../shared/rbacPermissions.js';

function nowSql(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function createMemoryPool() {
  const db = {
    events: [],
    event_registrations: [],
    email_campaigns: [],
    email_campaign_revisions: [],
    email_campaign_recipients: [],
    email_outbox_jobs: [],
    email_provider_events: [],
    event_resources: [],
    event_resource_versions: [],
    event_resource_grants: [],
    email_preferences: [],
    email_suppressions: [],
    email_design_templates: [],
    email_audit_log: [],
  };

  const uniques = {
    email_campaign_recipients: (row) => `${row.campaign_id}::${row.email_normalized}`,
    email_outbox_jobs: (row) => `${row.campaign_id}::${row.recipient_id}::${row.attempt_key}`,
    email_provider_events: (row) => row.svix_id,
    event_resource_grants: (row) => row.token_hash,
    email_preferences: (row) => row.email_normalized,
    email_suppressions: (row) => `${row.email_normalized}::${row.reason}`,
    events: (row) => row.id,
    event_registrations: (row) => row.id,
    email_campaigns: (row) => row.id,
    email_campaign_revisions: (row) => row.id,
    event_resources: (row) => row.id,
    event_resource_versions: (row) => row.id,
    email_design_templates: (row) => row.id,
    email_audit_log: (row) => row.id,
  };

  function tableName(sql) {
    const match = String(sql).match(/(?:INTO|FROM|UPDATE)\s+([a-z_]+)/i);
    return match?.[1];
  }

  function applyWhere(rows, whereSql, params) {
    let next = [...rows];
    const where = String(whereSql || '').split(/ORDER BY|LIMIT/i)[0] || '';
    const parts = where.split(/AND/i).map((item) => item.trim()).filter(Boolean);
    let idx = 0;
    for (const part of parts) {
      if (part.includes('IN (')) {
        const col = part.split(/\s+/)[0];
        const count = (part.match(/\?/g) || []).length;
        const values = params.slice(idx, idx + count).map(String);
        idx += count;
        next = next.filter((row) => values.includes(String(row[col])));
        continue;
      }
      if (/scheduled_at\s*<=\s*NOW\(\)/i.test(part)) {
        next = next.filter((row) => new Date(row.scheduled_at) <= new Date());
        continue;
      }
      if (/revoked_at IS NULL/i.test(part)) {
        next = next.filter((row) => !row.revoked_at);
        continue;
      }
      const eq = part.match(/^([a-z_]+)\s*=\s*\?$/i);
      if (eq) {
        const value = params[idx++];
        next = next.filter((row) => String(row[eq[1]]) === String(value));
        continue;
      }
      const lit = part.match(/^([a-z_]+)\s*=\s*'([^']+)'$/i);
      if (lit) {
        next = next.filter((row) => String(row[lit[1]]) === lit[2]);
      }
    }
    return { rows: next, consumed: idx };
  }

  function parseValues(sql) {
    const match = String(sql).match(/VALUES\s*\((.*)\)(?:\s+ON DUPLICATE|$)/i);
    return match ? match[1].split(',').map((item) => item.trim()) : [];
  }

  function cols(sql) {
    const match = String(sql).match(/\(([a-z0-9_,\s]+)\)\s*VALUES/i);
    return match ? match[1].split(',').map((item) => item.trim()) : [];
  }

  async function query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    const table = tableName(text);
    if (!table || !db[table]) return [[]];

    if (/^INSERT/i.test(text)) {
      const columns = cols(text);
      const valueExprs = parseValues(text);
      const row = { created_at: nowSql(), updated_at: nowSql() };
      let p = 0;
      columns.forEach((col, i) => {
        const expr = valueExprs[i] || '?';
        if (expr === '?') row[col] = params[p++];
        else if (/^'.*'$/.test(expr)) row[col] = expr.slice(1, -1);
        else if (/^\d+$/.test(expr)) row[col] = Number(expr);
        else if (/DATE_ADD\(NOW\(\), INTERVAL \? DAY\)/i.test(expr)) {
          row[col] = nowSql(new Date(Date.now() + Number(params[p++] || 30) * 86400000));
        } else if (/NOW\(\)/i.test(expr)) row[col] = nowSql();
        else row[col] = params[p++];
      });
      const keyFn = uniques[table];
      const existing = keyFn ? db[table].find((item) => keyFn(item) === keyFn(row)) : null;
      if (existing && /ON DUPLICATE KEY UPDATE/i.test(text)) {
        Object.assign(existing, row, { id: existing.id });
        return [{ affectedRows: 2 }];
      }
      if (existing) {
        const error = new Error('Duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      db[table].push(row);
      return [{ affectedRows: 1 }];
    }

    if (/^DELETE/i.test(text)) {
      const where = text.split(/WHERE/i)[1] || '';
      const { rows } = applyWhere(db[table], where, params);
      const ids = new Set(rows.map((row) => row.id || `${row.email_normalized}:${row.reason}`));
      db[table] = db[table].filter((row) => !ids.has(row.id || `${row.email_normalized}:${row.reason}`));
      return [{ affectedRows: rows.length }];
    }

    if (/^UPDATE/i.test(text)) {
      const setPart = text.split(/SET/i)[1].split(/WHERE/i)[0];
      const where = text.split(/WHERE/i)[1] || '';
      const assignments = [];
      let buf = '';
      let depth = 0;
      for (const ch of setPart) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
          assignments.push(buf.trim());
          buf = '';
        } else buf += ch;
      }
      if (buf.trim()) assignments.push(buf.trim());
      let p = 0;
      const setOps = assignments.map((assign) => {
        const col = assign.split('=')[0].trim();
        if (assign.includes('tries = tries + 1')) return (row) => { row.tries = Number(row.tries || 0) + 1; };
        if (/IF\(outcome/i.test(assign)) {
          return (row) => {
            if (row.outcome === 'accepted' || row.outcome === 'pending') row.outcome = 'delivered';
          };
        }
        if (/COALESCE\(/i.test(assign)) {
          return (row) => { if (!row[col]) row[col] = nowSql(); };
        }
        if (/DATE_ADD\(NOW\(\), INTERVAL \? MINUTE\)/i.test(assign)) {
          const minutes = Number(params[p++] || 1);
          return (row) => { row[col] = nowSql(new Date(Date.now() + minutes * 60000)); };
        }
        if (/NOW\(\)/i.test(assign) && !assign.includes('?')) return (row) => { row[col] = nowSql(); };
        if (assign.includes('?')) {
          const value = params[p++];
          return (row) => { row[col] = value; };
        }
        const lit = assign.split('=').slice(1).join('=').trim().replace(/^'|'$/g, '');
        return (row) => { row[col] = lit; };
      });
      const matched = applyWhere(db[table], where, params.slice(p)).rows;
      matched.forEach((row) => setOps.forEach((fn) => fn(row)));
      return [{ affectedRows: matched.length }];
    }

    if (/SUM\(|COUNT\(/i.test(text)) {
      const { rows } = applyWhere(db[table], text.split(/WHERE/i)[1] || '', params);
      if (table === 'email_outbox_jobs') {
        return [[{
          pending: rows.filter((row) => ['queued', 'claimed'].includes(row.status)).length,
          sent: rows.filter((row) => row.status === 'sent').length,
          dead: rows.filter((row) => row.status === 'dead').length,
          skipped: rows.filter((row) => row.status === 'skipped').length,
          total: rows.length,
        }]];
      }
      return [[{
        recipients: rows.length,
        included: rows.filter((row) => Number(row.included) === 1).length,
        accepted: rows.filter((row) => row.outcome === 'accepted').length,
        delivered: rows.filter((row) => row.outcome === 'delivered').length,
        bounced: rows.filter((row) => row.outcome === 'bounced').length,
        complained: rows.filter((row) => row.outcome === 'complained').length,
        failed: rows.filter((row) => row.outcome === 'failed').length,
        skipped: rows.filter((row) => row.outcome === 'skipped').length,
        opened: rows.filter((row) => row.opened_at).length,
        clicked: rows.filter((row) => row.clicked_at).length,
        unsubscribed: rows.filter((row) => row.unsubscribed_at).length,
      }]];
    }

    const { rows } = applyWhere(db[table], text.split(/WHERE/i)[1] || '', params);
    const ordered = /ORDER BY/i.test(text) ? rows : rows;
    const limit = text.match(/LIMIT\s+(\d+)/i);
    const sliced = limit ? ordered.slice(0, Number(limit[1])) : ordered;
    if (/SELECT id FROM/i.test(text)) return [sliced.map((row) => ({ id: row.id }))];
    if (/SELECT status FROM/i.test(text)) return [sliced.map((row) => ({ status: row.status }))];
    if (/SELECT email_normalized FROM/i.test(text)) return [sliced.map((row) => ({ email_normalized: row.email_normalized }))];
    return [sliced];
  }

  return { query, db };
}

function seedEvent(pool, id = 'evt-1') {
  pool.db.events.push({
    id,
    title: 'Growing People Summit',
    start_date: '2027-05-01',
    start_time: '09:00:00',
    timezone: 'Africa/Lusaka',
    event_mode: 'in_person',
    venue: 'Lusaka',
    location: 'Lusaka',
  });
  return id;
}

function seedRegistration(pool, overrides = {}) {
  const row = {
    id: overrides.id || `reg-${Math.random().toString(36).slice(2, 8)}`,
    event_id: 'evt-1',
    user_name: 'Ada Lovelace',
    user_email: 'ada@example.com',
    booked_for_name: 'Ada Lovelace',
    booked_for_email: 'ada@example.com',
    status: 'confirmed',
    payment_status: 'paid',
    registration_type: 'subscription',
    attendee_type: 'adult',
    attended_at: null,
    created_at: '2026-01-01 10:00:00',
    reference_code: 'MM-1',
    ...overrides,
  };
  pool.db.event_registrations.push(row);
  return row;
}

function signWebhook(secret, id, timestamp, body) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${expected}`,
  };
}

describe('RBAC campaign route keys', () => {
  it('separates view, manage, and send', () => {
    expect(resolveRouteAdminPermission({ path: '/api/admin/campaigns/abc', method: 'GET' })).toBe('campaigns.view');
    expect(resolveRouteAdminPermission({ path: '/api/admin/campaigns/abc', method: 'PUT' })).toBe('campaigns.manage');
    expect(resolveRouteAdminPermission({ path: '/api/admin/campaigns/abc/send', method: 'POST' })).toBe('campaigns.send');
    expect(resolveRouteAdminPermission({ path: '/api/admin/events/evt/resources', method: 'GET' })).toBe('campaigns.view');
    expect(permissionMatches(['campaigns.view'], 'campaigns.send')).toBe(false);
    expect(permissionMatches(['campaigns.send'], 'campaigns.view')).toBe(true);
  });
});

describe('audience preview', () => {
  it('dedupes by normalized email and hides people outside the event', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    seedRegistration(pool, { id: 'r1', user_email: 'ada@example.com' });
    seedRegistration(pool, { id: 'r2', user_email: 'Ada@Example.com', booked_for_email: 'Ada@Example.com' });
    seedRegistration(pool, { id: 'r3', event_id: 'evt-other', user_email: 'other@example.com' });
    const preview = await previewCampaignAudience(pool, { eventId: 'evt-1', purpose: 'event_service' });
    expect(preview.included_count).toBe(1);
    expect(preview.excluded.some((row) => row.reason === 'duplicate_email')).toBe(true);
    expect(preview.included[0].email).toBe('ada@example.com');
    expect(preview.included.some((row) => row.email === 'other@example.com')).toBe(false);
  });
});

describe('consent and dispatch', () => {
  const prevLive = process.env.RESEND_LIVE_SENDS;

  beforeEach(() => {
    process.env.RESEND_LIVE_SENDS = '1';
    process.env.RESEND_API_KEY = 're_test';
  });

  afterEach(() => {
    process.env.RESEND_LIVE_SENDS = prevLive;
  });

  it('blocks promotional mail after unsubscribe even if the snapshot already exists', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    seedRegistration(pool);
    await recordMarketingOptIn(pool, 'ada@example.com');
    const created = await createCampaign(pool, { eventId: 'evt-1', name: 'Promo', purpose: 'promotional' });
    await enqueueCampaign(pool, created, { scheduledAt: new Date() });
    await recordUnsubscribe(pool, 'ada@example.com');
    const job = await claimNextOutboxJob(pool);
    const result = await dispatchOutboxJob(pool, job, {
      config: { apiKey: 're_test', live: true },
      sendFn: vi.fn(),
    });
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('unsubscribed');
  });

  it('suppresses later campaigns after a hard bounce', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    seedRegistration(pool);
    await recordSuppression(pool, 'ada@example.com', 'hard_bounce', 'resend');
    const gate = await evaluateRecipientEligibility(pool, { email: 'ada@example.com', purpose: 'event_service' });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('hard_bounce');
  });

  it('does not retry after an ambiguous provider timeout', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    seedRegistration(pool);
    const created = await createCampaign(pool, { eventId: 'evt-1', name: 'Update' });
    await enqueueCampaign(pool, created, { scheduledAt: new Date() });
    const job = await claimNextOutboxJob(pool);
    const result = await processClaimedJob(pool, job, {
      config: { apiKey: 're_test', live: true },
      sendFn: async () => ({ status: 'acceptance_unknown', reason: 'timeout' }),
    });
    expect(result.status).toBe('acceptance_unknown');
    expect(pool.db.email_outbox_jobs[0].status).toBe('acceptance_unknown');
  });

  it('claims a job only once across a worker restart race', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    seedRegistration(pool);
    const created = await createCampaign(pool, { eventId: 'evt-1', name: 'Update' });
    await enqueueCampaign(pool, created, { scheduledAt: new Date() });
    const first = await claimNextOutboxJob(pool);
    const second = await claimNextOutboxJob(pool);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });
});

describe('webhooks', () => {
  it('rejects forged signatures and ignores duplicate or out-of-order events', async () => {
    const pool = createMemoryPool();
    const secret = Buffer.from('webhook-secret').toString('base64');
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'msg-1' },
    });
    expect(() => verifyResendWebhook({
      rawBody: body,
      headers: { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,forged' },
      secret,
    })).toThrow(/Invalid webhook/);

    pool.db.email_campaign_recipients.push({
      id: 'rcpt-1',
      campaign_id: 'cmp-1',
      email_normalized: 'ada@example.com',
      provider_message_id: 'msg-1',
      outcome: 'accepted',
    });

    const delivered = signWebhook(secret, 'svix-1', '100', body);
    const first = await ingestResendWebhook(pool, { rawBody: body, headers: delivered, secret });
    expect(first.duplicate).toBe(false);
    const second = await ingestResendWebhook(pool, { rawBody: body, headers: delivered, secret });
    expect(second.duplicate).toBe(true);

    const bounceBody = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'msg-1', bounce: { type: 'Permanent', message: '550' } },
    });
    const bounceHeaders = signWebhook(secret, 'svix-2', '90', bounceBody);
    await ingestResendWebhook(pool, { rawBody: bounceBody, headers: bounceHeaders, secret });
    expect(pool.db.email_campaign_recipients[0].outcome).toBe('bounced');
    expect(pool.db.email_suppressions.some((row) => row.reason === 'hard_bounce')).toBe(true);

    const lateDelivered = signWebhook(secret, 'svix-3', '110', body);
    await ingestResendWebhook(pool, { rawBody: body, headers: lateDelivered, secret });
    expect(pool.db.email_campaign_recipients[0].outcome).toBe('bounced');
  });
});

describe('resources', () => {
  it('enforces public vs bearer access, expiry, revocation, and GET/HEAD non-consumption', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    const appRoot = path.join(os.tmpdir(), `mm-res-${Date.now()}`);
    const resource = await createEventResource(pool, { eventId: 'evt-1', title: 'Workbook', accessMode: 'registrant_link' });
    await addResourceVersion(pool, {
      resource,
      buffer: Buffer.from('hello'),
      originalName: 'notes.pdf',
      mimeType: 'application/pdf',
      appRoot,
    });
    await setResourcePublished(pool, resource.id, true);

    const denied = await resolveResourceAccess(pool, { resourceId: resource.id, token: 'nope', method: 'GET' });
    expect(denied.ok).toBe(false);

    const raw = 'a'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    pool.db.event_resource_grants.push({
      id: 'g1',
      resource_id: resource.id,
      event_id: 'evt-1',
      token_hash: hash,
      expires_at: nowSql(new Date(Date.now() + 86400000)),
      revoked_at: null,
    });
    const okGet = await resolveResourceAccess(pool, { resourceId: resource.id, token: raw, method: 'GET' });
    const okHead = await resolveResourceAccess(pool, { resourceId: resource.id, token: raw, method: 'HEAD' });
    expect(okGet.ok).toBe(true);
    expect(okGet.consume).toBe(false);
    expect(okHead.ok).toBe(true);
    expect(pool.db.event_resource_grants[0].revoked_at).toBeNull();

    const wrongEvent = await resolveResourceAccess(pool, { resourceId: resource.id, token: raw, method: 'GET' });
    expect(wrongEvent.ok).toBe(true);
    pool.db.event_resource_grants[0].event_id = 'evt-other';
    const mismatch = await resolveResourceAccess(pool, { resourceId: resource.id, token: raw, method: 'GET' });
    expect(mismatch.ok).toBe(false);

    pool.db.event_resource_grants[0].event_id = 'evt-1';
    await revokeRegistrationGrants(pool, { resourceId: resource.id });
    const revoked = await resolveResourceAccess(pool, { resourceId: resource.id, token: raw, method: 'GET' });
    expect(revoked.ok).toBe(false);

    const publicResource = await createEventResource(pool, { eventId: 'evt-1', title: 'Public pack', accessMode: 'public' });
    await setResourcePublished(pool, publicResource.id, true);
    const pub = await resolveResourceAccess(pool, { resourceId: publicResource.id, method: 'GET' });
    expect(pub.ok).toBe(true);
  });

  it('rejects verified access in Phase 1', async () => {
    const pool = createMemoryPool();
    await expect(createEventResource(pool, { eventId: 'evt-1', title: 'Secret', accessMode: 'verified' }))
      .rejects.toThrow(/not available/);
  });
});

describe('preference tokens and live-send gate', () => {
  it('round-trips a preference token', () => {
    const token = signPreferenceToken('Ada@Example.com');
    expect(readPreferenceToken(token).email).toBe('ada@example.com');
  });

  it('refuses live audience sends until RESEND_LIVE_SENDS=1', async () => {
    const pool = createMemoryPool();
    seedEvent(pool);
    const created = await createCampaign(pool, { eventId: 'evt-1', name: 'Update' });
    const prev = process.env.RESEND_LIVE_SENDS;
    process.env.RESEND_LIVE_SENDS = '';
    await expect(startCampaignSend(pool, created.id, { confirmed: true })).rejects.toThrow(/disabled/);
    process.env.RESEND_LIVE_SENDS = prev;
    await expect(startCampaignSend(pool, created.id, { confirmed: false })).rejects.toThrow(/confirmation/);
    await cancelCampaignJobs(pool, created.id, 'admin');
    const campaign = await getCampaign(pool, created.id);
    expect(['cancelled', 'draft'].includes(campaign.state)).toBe(true);
  });
});
