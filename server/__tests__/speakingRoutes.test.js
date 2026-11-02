// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ACKNOWLEDGEMENTS_PER_HOUR,
  MAX_SPEAKER_PROFILE_BYTES,
  ORGANISER_EMAIL_NOTICE,
  clientRateKey,
  createHourlyCap,
  parsePdfDataUrl,
  pruneSpeakerProfiles,
  registerSpeakingRoutes,
} from '../speakingRoutes.js';
import { ENQUIRY_TOKEN_MAX_AGE_MS, checkEnquiryToken, issueEnquiryToken } from '../speakingEnquiryService.js';
import { ENGAGEMENT_WRITABLE_FIELDS } from '../speakingService.js';
import { applyNotificationTemplates } from '../notificationTemplateService.js';
import { rateLimitByKey } from '../securityHelpers.js';
import { resolveRouteAdminPermission } from '../rbacService.js';
import { ALL_PERMISSION_KEYS, DEFAULT_ADMIN_ROLES } from '../../shared/rbacPermissions.js';
import { buildBrandedEmailHtml } from '../../shared/brandedEmailHtml.js';
import { applyRecipientFooterLinks } from '../../shared/emailFooter.js';

/** Just enough of mysql2 for the SQL the speaking services issue. */
function createSpeakingPool() {
  const tables = { speaking_engagements: [], speaking_enquiries: [] };
  const metrics = [];
  const insertDefaults = {
    speaking_engagements: { published_at: null, hidden_at: null },
    speaking_enquiries: {
      admin_notes: null, engagement_id: null, admin_email_status: null, ack_email_status: null, replied_at: null,
    },
  };
  let clock = 0;
  const stamp = () => `2026-11-01 00:${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock++ % 60).padStart(2, '0')}`;

  // SQL semantics: NULL matches nothing, except through the null-safe <=>.
  const compare = {
    '=': (a, b) => a != null && b != null && a === b,
    '<>': (a, b) => a != null && b != null && a !== b,
    '<=>': (a, b) => (a ?? null) === (b ?? null),
  };
  const filter = (table, where, params) => {
    if (!where) return [...table];
    const conditions = where.split(' AND ').map((part) => part.match(/^(\w+) (=|<>|<=>) \?$/));
    if (conditions.some((c) => !c)) throw new Error(`Unsupported WHERE: ${where}`);
    return table.filter((row) => conditions.every(([, column, op], i) => compare[op](row[column], params[i])));
  };

  const tableFor = (name) => {
    if (!tables[name]) throw new Error(`Unexpected table: ${name}`);
    return tables[name];
  };

  const fake = {
    table: tables.speaking_engagements,
    enquiries: tables.speaking_enquiries,
    metrics,
    log: [],
    // Set to make every query wait (to let two requests interleave) or fail.
    delayMs: 0,
    failWith: null,
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (fake.delayMs) await new Promise((resolve) => { setTimeout(resolve, fake.delayMs); });
      if (fake.failWith) throw fake.failWith;
      fake.log.push(text);
      // Activity counts: every row counts as "today" in this fake.
      if (text.startsWith('INSERT INTO speaking_metrics')) {
        const [metric, engagementId] = params;
        const row = metrics.find((r) => r.metric === metric && r.engagement_id === engagementId);
        if (row) row.total += 1;
        else metrics.push({ metric, engagement_id: engagementId, total: 1 });
        return [{ affectedRows: 1 }];
      }
      if (text.startsWith('SELECT metric, engagement_id, SUM(total)')) {
        return [metrics.map((r) => ({ ...r, recent: r.total }))];
      }
      if (text.startsWith('SELECT COUNT(*) AS total, SUM(CASE')) {
        const total = tables.speaking_enquiries.length;
        return [[{ total, recent: total }]];
      }
      if (text === 'SELECT COUNT(*) AS total FROM speaking_enquiries WHERE status = ?') {
        return [[{ total: tables.speaking_enquiries.filter((r) => r.status === params[0]).length }]];
      }
      let m = text.match(/^SELECT \* FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\d+))?$/);
      if (m) {
        let rows = filter(tableFor(m[1]), m[2], params);
        if (m[3]) rows.sort((a, b) => String(a[m[3]]).localeCompare(String(b[m[3]])) * (m[4] === 'DESC' ? -1 : 1));
        if (m[5]) rows = rows.slice(0, Number(m[5]));
        return [rows.map((row) => ({ ...row }))];
      }
      m = text.match(/^INSERT INTO (\w+) \((.+)\) VALUES/);
      if (m) {
        const row = { ...insertDefaults[m[1]] };
        m[2].split(', ').forEach((column, i) => { row[column] = params[i]; });
        row.created_at = stamp();
        row.updated_at = row.created_at;
        tableFor(m[1]).push(row);
        return [{ affectedRows: 1 }];
      }
      m = text.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/);
      if (m) {
        const assignments = m[2].split(', ').map((assignment) => {
          const parsed = assignment.match(/^(\w+) = (\?|NOW\(\)|NULL)$/);
          if (!parsed) throw new Error(`Unsupported SET: ${assignment}`);
          return parsed;
        });
        const setCount = assignments.filter(([, , rhs]) => rhs === '?').length;
        const rows = filter(tableFor(m[1]), m[3], params.slice(setCount));
        for (const row of rows) {
          let i = 0;
          for (const [, column, rhs] of assignments) {
            row[column] = rhs === '?' ? params[i++] : rhs === 'NULL' ? null : stamp();
          }
          row.updated_at = stamp();
        }
        return [{ affectedRows: rows.length }];
      }
      m = text.match(/^DELETE FROM (\w+) WHERE id = \?$/);
      if (m) {
        const table = tableFor(m[1]);
        const index = table.findIndex((r) => r.id === params[0]);
        if (index >= 0) table.splice(index, 1);
        return [{ affectedRows: index >= 0 ? 1 : 0 }];
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
  return fake;
}

const MANAGER = 'speaking.view,speaking.manage';
const TOKEN_SECRET = 'test-secret';
let pool;
let server;
let baseUrl;
let uploadsRoot;
let settings;
let sendEmail;
let enquiryLimiter;
let limiterRound = 0;
let ackCap;

async function api(method, path, { body, perms = MANAGER } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (perms !== null) headers['x-test-perms'] = perms;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function createEngagement(body) {
  const { status, json } = await api('POST', '/api/admin/speaking/engagements', { body });
  expect(status).toBe(201);
  return json.data;
}

const FULL = {
  event_title: 'China–Africa Public Health Forum 2026',
  organiser: 'Forum Secretariat',
  event_type: 'forum',
  roles: ['speaker', 'panellist'],
  session_title: 'Local manufacturing in Africa',
  description: 'Participating in the forum and related workshop.',
  start_date: '2099-11-06',
  end_date: '2099-11-11',
  dates_tbc: false,
  session_date: '2099-11-07',
  session_start_time: '09:30',
  session_end_time: '10:15',
  timezone: 'Asia/Shanghai',
  attendance_format: 'in_person',
  venue: 'Convention Centre',
  city: 'Guangzhou',
  country: 'China',
  audience_access: 'invitation_only',
  event_url: 'https://example.org/forum',
  image_url: '/uploads/site/forum-logo.png',
  image_alt: 'Forum logo',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  featured: true,
  topics: ['Local manufacturing', 'Health security'],
  media: [{ type: 'recording', url: 'https://video.example.net/panel-recording', label: 'Watch the panel' }],
  admin_notes: 'PRIVATE-NOTE organiser contact +260 97 000 0000',
};

// Every column an admin edit writes, named as the API returns it (roles_json → roles),
// so a column added later is covered by the lifecycle test automatically.
const WRITABLE = ENGAGEMENT_WRITABLE_FIELDS.map((field) => field.replace(/_json$/, ''));
const pick = (record) => Object.fromEntries(WRITABLE.map((key) => [key, record[key]]));
const publish = (id) => api('POST', `/api/admin/speaking/engagements/${id}/publish`);

beforeAll(async () => {
  uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'speaking-uploads-'));
  const app = express();
  app.use(express.json());
  // Stands in for the global admin gate: a header carries the caller's permissions.
  app.use('/api/admin', (req, _res, next) => {
    const perms = req.headers['x-test-perms'];
    if (typeof perms === 'string') req.adminUser = { sub: 'usr-admin', permissions: perms.split(',').filter(Boolean) };
    next();
  });
  let n = 0;
  // Routes keep the pool they were registered with; delegate so each test gets a fresh table.
  const currentPool = { query: (...args) => pool.query(...args) };
  registerSpeakingRoutes(app, {
    pool: currentPool,
    generateEntityId: (prefix) => `${prefix}-${++n}`,
    uploadsRoot,
    tokenSecret: TOKEN_SECRET,
    getSystemSettings: async () => settings,
    sendEmailNotification: (...args) => sendEmail(...args),
    resolvePublicAppUrl: () => 'https://site.test',
    fallbackAdminEmail: () => 'fallback@site.test',
    enquiryRateLimit: (...args) => enquiryLimiter(...args),
    allowAcknowledgement: () => ackCap(),
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(uploadsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  pool = createSpeakingPool();
  settings = {
    notifications: { adminAlertEmail: 'alerts@site.test' },
    email: { fromEmail: 'grow@site.test', replyTo: 'reply@site.test' },
  };
  sendEmail = vi.fn().mockResolvedValue({ channel: 'email', status: 'sent' });
  // Same limit as production, with fresh buckets for every test.
  enquiryLimiter = rateLimitByKey({ routeKey: `test-enquiries-${++limiterRound}`, windowMs: 60 * 60_000, max: 5, getKey: () => 'client' });
  ackCap = createHourlyCap(ACKNOWLEDGEMENTS_PER_HOUR);
});

describe('speaking engagement lifecycle', () => {
  it('creates a draft, then publishes, hides, and republishes without losing data', async () => {
    const created = await createEngagement({ ...FULL, publication_state: 'published' });
    expect(created.publication_state).toBe('draft');
    const original = pick(created);
    // Compared with what was submitted, not just with itself, so a column that
    // stopped being saved can't pass unnoticed. Times come back to the second.
    expect(original).toEqual({ ...FULL, session_start_time: '09:30:00', session_end_time: '10:15:00' });

    for (const step of ['publish', 'hide', 'publish']) {
      const { status, json } = await api('POST', `/api/admin/speaking/engagements/${created.id}/${step}`);
      expect(status).toBe(200);
      expect(json.data.publication_state).toBe(step === 'hide' ? 'hidden' : 'published');
      expect(pick(json.data)).toEqual(original);
    }
  });

  it('keeps an engagement with dates to be confirmed undated through publish, hide and republish', async () => {
    const created = await createEngagement({ event_title: 'Dates TBC', dates_tbc: true });
    for (const step of ['publish', 'hide', 'publish']) {
      const { json } = await api('POST', `/api/admin/speaking/engagements/${created.id}/${step}`);
      expect(json.data).toMatchObject({ dates_tbc: true, start_date: null, end_date: null });
    }
    const { json } = await api('GET', `/api/speaking/engagements/${created.id}`, { perms: null });
    expect(json.data).toMatchObject({ dates_tbc: true, start_date: null, section: 'tba' });
  });

  it('marking an engagement Invited or Confirmed never changes its publication state', async () => {
    const { id } = await createEngagement({ event_title: 'Summit', participation_status: 'invited' });

    let res = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { participation_status: 'confirmed' } });
    expect(res.json.data.publication_state).toBe('draft');

    await publish(id);
    res = await api('PUT', `/api/admin/speaking/engagements/${id}`, {
      body: { participation_status: 'invited', publication_state: 'draft' },
    });
    expect(res.json.data.participation_status).toBe('invited');
    expect(res.json.data.publication_state).toBe('published');
    res = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { participation_status: 'confirmed' } });
    expect(res.json.data.publication_state).toBe('published');
  });

  it('declining a published engagement hides it, so marking it Confirmed later keeps it private', async () => {
    const { id } = await createEngagement({ ...FULL, event_title: 'Withdrawn keynote' });
    await publish(id);
    const isPublic = async () => (await api('GET', `/api/speaking/engagements/${id}`, { perms: null })).status === 200;
    expect(await isPublic()).toBe(true);

    let res = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { participation_status: 'declined' } });
    expect(res.json.data).toMatchObject({ participation_status: 'declined', publication_state: 'hidden' });
    expect(res.json.data.hidden_at).toBeTruthy();
    expect(await isPublic()).toBe(false);

    for (const status of ['invited', 'confirmed']) {
      res = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { participation_status: status } });
      expect(res.json.data).toMatchObject({ participation_status: status, publication_state: 'hidden' });
      expect(await isPublic()).toBe(false);
    }
    const { json } = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(json.data).toEqual({ upcoming: [], previous: [], cancelled: [], tba: [] });

    // Putting it back online stays an explicit action.
    expect((await publish(id)).status).toBe(200);
    expect(await isPublic()).toBe(true);
  });

  it('declining a draft leaves it a draft', async () => {
    const { id } = await createEngagement({ event_title: 'Not yet published' });
    const res = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { participation_status: 'declined' } });
    expect(res.json.data).toMatchObject({ participation_status: 'declined', publication_state: 'draft', hidden_at: null });
  });

  it('refuses to publish a declined engagement, and hides only published ones', async () => {
    const declined = await createEngagement({ event_title: 'Declined', participation_status: 'declined' });
    expect((await api('POST', `/api/admin/speaking/engagements/${declined.id}/publish`)).status).toBe(409);

    const draft = await createEngagement({ event_title: 'Draft' });
    expect((await api('POST', `/api/admin/speaking/engagements/${draft.id}/hide`)).status).toBe(409);
  });

  it('duplicates as an unfeatured draft copy', async () => {
    const source = await createEngagement(FULL);
    await api('POST', `/api/admin/speaking/engagements/${source.id}/publish`);

    const { status, json } = await api('POST', `/api/admin/speaking/engagements/${source.id}/duplicate`);
    expect(status).toBe(201);
    expect(json.data.id).not.toBe(source.id);
    expect(json.data.publication_state).toBe('draft');
    expect(json.data.featured).toBe(false);
    expect(json.data.event_title).toBe(`${FULL.event_title} (copy)`);
    expect(json.data.admin_notes).toBe(FULL.admin_notes);
  });

  it('keeps fields a partial update does not mention', async () => {
    const { id } = await createEngagement(FULL);
    const { json } = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { description: 'Updated.' } });
    expect(json.data.description).toBe('Updated.');
    expect(json.data.organiser).toBe(FULL.organiser);
    expect(json.data.roles).toEqual(FULL.roles);
  });

  it('deletes a record', async () => {
    const { id } = await createEngagement({ event_title: 'Delete me' });
    expect((await api('DELETE', `/api/admin/speaking/engagements/${id}`)).status).toBe(200);
    expect((await api('GET', `/api/admin/speaking/engagements/${id}`)).status).toBe(404);
  });
});

describe('server-side validation', () => {
  it('rejects unsafe event URLs', async () => {
    const { status, json } = await api('POST', '/api/admin/speaking/engagements', {
      body: { event_title: 'A', event_url: 'javascript:alert(1)' },
    });
    expect(status).toBe(400);
    expect(json.errors.event_url).toBeTruthy();
    expect(pool.table).toHaveLength(0);
  });

  it('saves an engagement whose dates are to be confirmed', async () => {
    const created = await createEngagement({ event_title: 'Dates TBC', dates_tbc: true });
    expect(created.dates_tbc).toBe(true);
    expect(created.start_date).toBeNull();
  });
});

describe('public visibility', () => {
  async function seed() {
    const published = await createEngagement({ ...FULL, event_title: 'Published' });
    await api('POST', `/api/admin/speaking/engagements/${published.id}/publish`);

    const draft = await createEngagement({ ...FULL, event_title: 'Draft only' });

    const hidden = await createEngagement({ ...FULL, event_title: 'Hidden later' });
    await api('POST', `/api/admin/speaking/engagements/${hidden.id}/publish`);
    await api('POST', `/api/admin/speaking/engagements/${hidden.id}/hide`);

    const declined = await createEngagement({ ...FULL, event_title: 'Declined later' });
    await api('POST', `/api/admin/speaking/engagements/${declined.id}/publish`);
    await api('PUT', `/api/admin/speaking/engagements/${declined.id}`, { body: { participation_status: 'declined' } });

    return { published, draft, hidden, declined };
  }

  it('lists only published, non-declined engagements, without private fields', async () => {
    const { published } = await seed();
    const { status, json } = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(status).toBe(200);
    const all = [...json.data.upcoming, ...json.data.previous, ...json.data.tba];
    expect(all.map((e) => e.id)).toEqual([published.id]);
    expect(JSON.stringify(json)).not.toContain('PRIVATE-NOTE');
    expect(all[0]).not.toHaveProperty('admin_notes');
    expect(all[0]).not.toHaveProperty('publication_state');
  });

  it('returns the same 404 for draft, hidden, declined, and missing records', async () => {
    const { published, draft, hidden, declined } = await seed();
    expect((await api('GET', `/api/speaking/engagements/${published.id}`, { perms: null })).status).toBe(200);

    const bodies = [];
    for (const id of [draft.id, hidden.id, declined.id, 'spk-does-not-exist']) {
      const { status, json } = await api('GET', `/api/speaking/engagements/${id}`, { perms: null });
      expect(status).toBe(404);
      bodies.push(JSON.stringify(json));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('splits engagements into upcoming, previous, and to-be-announced', async () => {
    for (const body of [
      { event_title: 'Future', start_date: '2099-01-10' },
      { event_title: 'Past', start_date: '2020-05-01', end_date: '2020-05-03' },
      { event_title: 'Undated' },
    ]) {
      const { id } = await createEngagement(body);
      await api('POST', `/api/admin/speaking/engagements/${id}/publish`);
    }
    const { json } = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(json.data.upcoming.map((e) => e.event_title)).toEqual(['Future']);
    expect(json.data.previous.map((e) => e.event_title)).toEqual(['Past']);
    expect(json.data.tba.map((e) => e.event_title)).toEqual(['Undated']);
  });

  it('keeps past and undated drafts, hidden and declined records out of every public list and the detail route', async () => {
    const PAST = { ...FULL, start_date: '2020-05-01', end_date: '2020-05-03', session_date: '2020-05-02' };
    const UNDATED = { ...FULL, dates_tbc: true };
    const shown = {};
    const kept = [];
    for (const [label, base] of [['past', PAST], ['undated', UNDATED]]) {
      const published = await createEngagement({ ...base, event_title: `Published ${label}` });
      await publish(published.id);
      shown[label] = published.id;

      const draft = await createEngagement({ ...base, event_title: `Draft ${label}` });
      const hidden = await createEngagement({ ...base, event_title: `Hidden ${label}` });
      await publish(hidden.id);
      await api('POST', `/api/admin/speaking/engagements/${hidden.id}/hide`);
      const declined = await createEngagement({ ...base, event_title: `Declined ${label}` });
      await publish(declined.id);
      await api('PUT', `/api/admin/speaking/engagements/${declined.id}`, { body: { participation_status: 'declined' } });
      // Published and declined at once, as a record saved before declining also hid it.
      pool.table.find((row) => row.id === declined.id).publication_state = 'published';
      kept.push(draft.id, hidden.id, declined.id);
    }

    const { json } = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(Object.values(json.data).flat().map((e) => e.id).sort()).toEqual(Object.values(shown).sort());
    expect(json.data.previous.map((e) => e.id)).toEqual([shown.past]);
    expect(json.data.tba.map((e) => e.id)).toEqual([shown.undated]);
    for (const id of kept) {
      expect((await api('GET', `/api/speaking/engagements/${id}`, { perms: null })).status).toBe(404);
    }
  });

  it('removing the event URL removes every trace of it from the public record', async () => {
    const { id } = await createEngagement(FULL);
    await publish(id);
    expect((await api('GET', `/api/speaking/engagements/${id}`, { perms: null })).json.data.event_url)
      .toBe('https://example.org/forum');

    const saved = await api('PUT', `/api/admin/speaking/engagements/${id}`, { body: { event_url: '' } });
    expect(saved.json.data.event_url).toBeNull();
    const detail = await api('GET', `/api/speaking/engagements/${id}`, { perms: null });
    const list = await api('GET', '/api/speaking/engagements', { perms: null });
    const listed = list.json.data.upcoming.find((e) => e.id === id);
    expect(detail.json.data.event_url).toBeNull();
    expect(listed.event_url).toBeNull();
    expect(JSON.stringify([detail.json, list.json])).not.toContain('example.org/forum');
    // Media links are separate actions and are not affected.
    expect(listed.media).toEqual(FULL.media);
  });
});

describe('admin permissions', () => {
  it('requires a signed-in admin with the right permission', async () => {
    expect((await api('GET', '/api/admin/speaking/engagements', { perms: null })).status).toBe(401);
    expect((await api('GET', '/api/admin/speaking/engagements', { perms: 'blog.view' })).status).toBe(403);
    expect((await api('GET', '/api/admin/speaking/engagements', { perms: 'speaking.view' })).status).toBe(200);
    const write = await api('POST', '/api/admin/speaking/engagements', { perms: 'speaking.view', body: { event_title: 'A' } });
    expect(write.status).toBe(403);
    expect(pool.table).toHaveLength(0);
  });

  it('maps admin speaking routes to the speaking permissions in the global gate', () => {
    expect(resolveRouteAdminPermission({ path: '/api/admin/speaking/engagements', method: 'GET' })).toBe('speaking.view');
    expect(resolveRouteAdminPermission({ path: '/api/admin/speaking/engagements/x/publish', method: 'POST' })).toBe('speaking.manage');
    expect(resolveRouteAdminPermission({ path: '/api/admin/speaking/engagements/x', method: 'DELETE' })).toBe('speaking.manage');
    expect(ALL_PERMISSION_KEYS).toEqual(expect.arrayContaining(['speaking.view', 'speaking.manage']));
    const contentManager = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'content_manager');
    expect(contentManager.permissions).toEqual(expect.arrayContaining(['speaking.view', 'speaking.manage']));
  });
});

describe('speaker profile upload', () => {
  const pdf = (body = '%PDF-1.7\n%test\n') => `data:application/pdf;base64,${Buffer.from(body).toString('base64')}`;

  it('accepts only real PDFs within the size limit', () => {
    expect(parsePdfDataUrl(pdf()).buffer).toBeInstanceOf(Buffer);
    expect(parsePdfDataUrl(pdf('<html>not a pdf</html>')).error).toMatch(/not a valid PDF/);
    expect(parsePdfDataUrl('data:image/png;base64,AAAA').error).toMatch(/Upload a PDF/);
    expect(parsePdfDataUrl(pdf(`%PDF-${'x'.repeat(MAX_SPEAKER_PROFILE_BYTES)}`)).error).toMatch(/7 MB/);
  });

  it('is gated by the website permission, like the rest of the page content', async () => {
    expect(resolveRouteAdminPermission({ path: '/api/admin/speaking/speaker-profile', method: 'POST' })).toBe('website.manage');
    const denied = await api('POST', '/api/admin/speaking/speaker-profile', { body: { file: pdf() }, perms: MANAGER });
    expect(denied.status).toBe(403);
  });

  it('stores an uploaded PDF under /uploads/speaking', async () => {
    const { status, json } = await api('POST', '/api/admin/speaking/speaker-profile', {
      body: { file: pdf() }, perms: 'website.manage',
    });
    expect(status).toBe(200);
    expect(json.url).toMatch(/^\/uploads\/speaking\/speaker-profile-\d+-[0-9a-f]{8}\.pdf$/);
    const saved = await fs.readFile(path.join(uploadsRoot, json.url.replace('/uploads/', '')), 'latin1');
    expect(saved.startsWith('%PDF-')).toBe(true);
  });

  it('rejects a file that is not a PDF', async () => {
    const res = await api('POST', '/api/admin/speaking/speaker-profile', {
      body: { file: pdf('MZ executable') }, perms: 'website.manage',
    });
    expect(res.status).toBe(400);
  });
});

const ENQUIRY = {
  organiser_name: 'andrew mukuni',
  organisation: 'Biomedical Society of Zambia',
  email: 'Andrew@Example.org',
  phone: '+260 97 000 0000',
  event_title: 'Annual Scientific Conference',
  proposed_start_date: '2027-03-04',
  proposed_end_date: '2027-03-05',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  location: 'Lusaka',
  audience: 'Laboratory managers',
  audience_size: '150',
  topic: 'Quality systems that last',
  requested_role: 'keynote_speaker',
  budget: 'Honorarium available',
  message: 'We would be honoured.',
};

const ENQUIRY_ADMIN = 'speaking.enquiries';
// Old enough to pass the time trap.
const freshToken = () => issueEnquiryToken(TOKEN_SECRET, Date.now() - 10_000);

function sendEnquiry(body = ENQUIRY, { token = freshToken() } = {}) {
  return api('POST', '/api/speaking/enquiries', { body: { ...body, form_token: token }, perms: null });
}

async function storedEnquiry(body) {
  expect((await sendEnquiry(body)).status).toBe(201);
  const { json } = await api('GET', '/api/admin/speaking/enquiries', { perms: ENQUIRY_ADMIN });
  return json.data[0];
}

const emailTo = (address) => sendEmail.mock.calls.map(([options]) => options).find((options) => options.to === address);

describe('speaking enquiries — public form', () => {
  it('stores the enquiry, notifies the admin, acknowledges the organiser, and publishes nothing', async () => {
    const { status, json } = await sendEnquiry();
    expect(status).toBe(201);
    expect(json).toEqual({ ok: true, data: { acknowledgementSent: true } });

    expect(pool.enquiries).toHaveLength(1);
    const [row] = pool.enquiries;
    expect(row).toMatchObject({
      status: 'new',
      email: 'andrew@example.org',
      event_title: ENQUIRY.event_title,
      requested_role: 'keynote_speaker',
      date_undecided: 0,
      admin_email_status: 'sent',
      ack_email_status: 'sent',
    });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const admin = emailTo('alerts@site.test');
    expect(admin).toMatchObject({ templateSlug: 'speaking_enquiry_admin', skipSms: true });
    expect(admin.templateVars.admin_url).toBe('https://site.test/admin/speaking-enquiries');
    expect(admin.templateVars.enquiry_summary).toContain('Event: Annual Scientific Conference');
    expect(admin.text).toContain('has not been accepted, scheduled, or published');

    const ack = emailTo('andrew@example.org');
    expect(ack).toMatchObject({ templateSlug: 'speaking_enquiry_ack', skipSms: true });
    expect(ack.templateVars.first_name).toBe('Andrew');
    expect(ack.text).toContain('does not confirm participation');

    expect(pool.table).toHaveLength(0);
    const publicList = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(publicList.json.data).toEqual({ upcoming: [], previous: [], cancelled: [], tba: [] });
  });

  it('falls back to the Reply-To address, then the site contact address, for the admin alert', async () => {
    settings.notifications = {};
    await sendEnquiry();
    expect(emailTo('reply@site.test')?.templateSlug).toBe('speaking_enquiry_admin');

    sendEmail.mockClear();
    settings.email = { fromEmail: 'grow@site.test' };
    await sendEnquiry();
    expect(emailTo('fallback@site.test')?.templateSlug).toBe('speaking_enquiry_admin');
  });

  it('keeps the enquiry and reports it when an email cannot be sent', async () => {
    sendEmail.mockImplementation(async ({ templateSlug }) => (
      templateSlug === 'speaking_enquiry_ack' ? { status: 'failed', reason: 'SMTP down' } : { status: 'sent' }
    ));
    const { status, json } = await sendEnquiry();
    expect(status).toBe(201);
    expect(json.data.acknowledgementSent).toBe(false);
    expect(pool.enquiries[0]).toMatchObject({ admin_email_status: 'sent', ack_email_status: 'failed' });

    sendEmail.mockRejectedValue(new Error('transport exploded'));
    expect((await sendEnquiry()).status).toBe(201);
    expect(pool.enquiries).toHaveLength(2);
  });

  it('accepts an enquiry whose date is not decided', async () => {
    const { proposed_start_date: _s, proposed_end_date: _e, ...undated } = ENQUIRY;
    expect((await sendEnquiry({ ...undated, date_undecided: true })).status).toBe(201);
    expect(pool.enquiries[0]).toMatchObject({ date_undecided: 1, proposed_start_date: null });
  });

  it('rejects missing or invalid fields, storing and sending nothing', async () => {
    const { status, json } = await sendEnquiry({ email: 'not-an-email', attendance_format: 'in_person' });
    expect(status).toBe(400);
    expect(Object.keys(json.errors)).toEqual(expect.arrayContaining([
      'organiser_name', 'organisation', 'email', 'event_title', 'proposed_start_date', 'location',
      'audience', 'topic', 'requested_role',
    ]));
    expect(pool.enquiries).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('quietly drops posts that fill the hidden spam field', async () => {
    const { status, json } = await sendEnquiry({ ...ENQUIRY, leave_this_blank: 'https://spam.example' });
    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(pool.enquiries).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('turns away missing, forged, and instant form tokens', async () => {
    const forged = `${Date.now() - 10_000}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    for (const token of ['', forged, issueEnquiryToken('other-secret', Date.now() - 10_000)]) {
      const { status, json } = await sendEnquiry(ENQUIRY, { token });
      expect(status).toBe(400);
      expect(json.message).toMatch(/expired/);
    }
    const instant = await sendEnquiry(ENQUIRY, { token: issueEnquiryToken(TOKEN_SECRET) });
    expect(instant.status).toBe(400);
    expect(instant.json.message).toMatch(/very quickly/);
    expect(pool.enquiries).toHaveLength(0);
  });

  it('issues a signed token the form sends back', async () => {
    const { json } = await api('GET', '/api/speaking/enquiry-token', { perms: null });
    expect(checkEnquiryToken(json.token, TOKEN_SECRET, Date.now() + 5_000)).toBe('ok');
    expect(checkEnquiryToken(json.token, TOKEN_SECRET)).toBe('too_fast');
  });

  it('limits each connection to five enquiries an hour', async () => {
    for (let i = 0; i < 5; i += 1) expect((await sendEnquiry()).status).toBe(201);
    expect((await sendEnquiry()).status).toBe(429);
    expect(pool.enquiries).toHaveLength(5);
  });
});

describe('speaking enquiries — admin', () => {
  it('needs the enquiries permission and never returns the IP hash', async () => {
    await sendEnquiry();
    expect((await api('GET', '/api/admin/speaking/enquiries', { perms: null })).status).toBe(401);
    expect((await api('GET', '/api/admin/speaking/enquiries', { perms: MANAGER })).status).toBe(403);

    const { status, json } = await api('GET', '/api/admin/speaking/enquiries', { perms: ENQUIRY_ADMIN });
    expect(status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).not.toHaveProperty('ip_hash');
    expect(json.data[0].date_undecided).toBe(false);
    const single = await api('GET', `/api/admin/speaking/enquiries/${json.data[0].id}`, { perms: ENQUIRY_ADMIN });
    expect(single.json.data).not.toHaveProperty('ip_hash');
  });

  it('changes only the review status and private notes', async () => {
    const enquiry = await storedEnquiry();
    const { status, json } = await api('PUT', `/api/admin/speaking/enquiries/${enquiry.id}`, {
      perms: ENQUIRY_ADMIN,
      body: { status: 'accepted', admin_notes: 'Call back Tuesday', email: 'changed@example.org', event_title: 'Changed' },
    });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ status: 'accepted', admin_notes: 'Call back Tuesday', email: 'andrew@example.org', event_title: ENQUIRY.event_title });

    const invalid = await api('PUT', `/api/admin/speaking/enquiries/${enquiry.id}`, { perms: ENQUIRY_ADMIN, body: { status: 'published' } });
    expect(invalid.status).toBe(400);
  });

  it('emails a reply from the site and moves a new enquiry into review', async () => {
    const enquiry = await storedEnquiry();
    sendEmail.mockClear();
    const { status, json } = await api('POST', `/api/admin/speaking/enquiries/${enquiry.id}/reply`, {
      perms: ENQUIRY_ADMIN,
      body: { subject: 'Re: Annual Scientific Conference', message: 'Thank you — could we talk next week?' },
    });
    expect(status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'andrew@example.org',
      subject: 'Re: Annual Scientific Conference',
      text: 'Thank you — could we talk next week?',
      skipSms: true,
    });
    expect(json.data.status).toBe('reviewing');
    expect(json.data.replied_at).toBeTruthy();
  });

  it('keeps a status the admin already chose when replying', async () => {
    const enquiry = await storedEnquiry();
    await api('PUT', `/api/admin/speaking/enquiries/${enquiry.id}`, { perms: ENQUIRY_ADMIN, body: { status: 'declined' } });
    const { json } = await api('POST', `/api/admin/speaking/enquiries/${enquiry.id}/reply`, {
      perms: ENQUIRY_ADMIN, body: { subject: 'Re: event', message: 'Unfortunately not this time.' },
    });
    expect(json.data.status).toBe('declined');
  });

  it('reports a reply that could not be sent and records nothing', async () => {
    const enquiry = await storedEnquiry();
    sendEmail.mockResolvedValue({ status: 'failed', reason: 'From email is not configured.' });
    const failed = await api('POST', `/api/admin/speaking/enquiries/${enquiry.id}/reply`, {
      perms: ENQUIRY_ADMIN, body: { subject: 'Re: event', message: 'Hello' },
    });
    expect(failed.status).toBe(502);
    expect(failed.json.message).toBe('From email is not configured.');
    expect(pool.enquiries[0]).toMatchObject({ status: 'new', replied_at: null });

    const empty = await api('POST', `/api/admin/speaking/enquiries/${enquiry.id}/reply`, {
      perms: ENQUIRY_ADMIN, body: { subject: ' ', message: '' },
    });
    expect(empty.status).toBe(400);
    expect(Object.keys(empty.json.errors)).toEqual(['subject', 'message']);
  });

  it('creates an unpublished, invited draft only on request, and only once', async () => {
    const { proposed_start_date: _s, proposed_end_date: _e, ...undated } = ENQUIRY;
    const enquiry = await storedEnquiry({ ...undated, date_undecided: true });
    expect(pool.table).toHaveLength(0);

    const path = `/api/admin/speaking/enquiries/${enquiry.id}/create-draft`;
    expect((await api('POST', path, { perms: ENQUIRY_ADMIN })).status).toBe(403);

    const { status, json } = await api('POST', path, { perms: `${ENQUIRY_ADMIN},speaking.manage` });
    expect(status).toBe(201);
    expect(json.data.engagement).toMatchObject({
      event_title: ENQUIRY.event_title,
      organiser: ENQUIRY.organisation,
      roles: ['keynote_speaker'],
      participation_status: 'invited',
      publication_state: 'draft',
      dates_tbc: true,
      attendance_format: 'in_person',
    });
    expect(json.data.engagement.admin_notes).toContain('Email: andrew@example.org');
    expect(json.data.enquiry.engagement_id).toBe(json.data.engagement.id);

    expect((await api('POST', path, { perms: `${ENQUIRY_ADMIN},speaking.manage` })).status).toBe(409);
    const publicList = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(publicList.json.data).toEqual({ upcoming: [], previous: [], cancelled: [], tba: [] });
  });

  it('deletes an enquiry', async () => {
    const enquiry = await storedEnquiry();
    expect((await api('DELETE', `/api/admin/speaking/enquiries/${enquiry.id}`, { perms: ENQUIRY_ADMIN })).status).toBe(200);
    expect((await api('GET', `/api/admin/speaking/enquiries/${enquiry.id}`, { perms: ENQUIRY_ADMIN })).status).toBe(404);
  });

  it('maps every enquiry route to the enquiries permission in the global gate', () => {
    for (const [path, method] of [
      ['/api/admin/speaking/enquiries', 'GET'],
      ['/api/admin/speaking/enquiries/x', 'PUT'],
      ['/api/admin/speaking/enquiries/x/reply', 'POST'],
      ['/api/admin/speaking/enquiries/x', 'DELETE'],
    ]) {
      expect(resolveRouteAdminPermission({ path, method })).toBe('speaking.enquiries');
    }
    const contentManager = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'content_manager');
    expect(contentManager.permissions).toContain('speaking.enquiries');
  });
});

describe('speaking activity counts', () => {
  const track = (body) => api('POST', '/api/speaking/metrics', { body, perms: null });

  it('counts event-website clicks only for published engagements, answering the same either way', async () => {
    const published = await createEngagement({ event_title: 'Published' });
    await api('POST', `/api/admin/speaking/engagements/${published.id}/publish`);
    const draft = await createEngagement({ event_title: 'Draft' });

    for (const id of [published.id, published.id, draft.id, 'spk-missing']) {
      const res = await fetch(`${baseUrl}/api/speaking/metrics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metric: 'event_website_click', engagement_id: id }),
      });
      expect(res.status).toBe(204);
    }
    expect(pool.metrics).toEqual([{ metric: 'event_website_click', engagement_id: published.id, total: 2 }]);
  });

  it('counts profile downloads for the page as a whole, and rejects unknown metrics', async () => {
    await fetch(`${baseUrl}/api/speaking/metrics`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metric: 'profile_download' }),
    });
    expect(pool.metrics).toEqual([{ metric: 'profile_download', engagement_id: '', total: 1 }]);
    expect((await track({ metric: 'page_view' })).status).toBe(400);
    expect((await track({ metric: 'event_website_click' })).status).toBe(400);
  });

  it('shows totals, including enquiries, only to admins who can view speaking engagements', async () => {
    const { id } = await createEngagement({ event_title: 'Counted' });
    await api('POST', `/api/admin/speaking/engagements/${id}/publish`);
    await fetch(`${baseUrl}/api/speaking/metrics`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metric: 'event_website_click', engagement_id: id }),
    });
    await sendEnquiry();

    expect((await api('GET', '/api/admin/speaking/metrics', { perms: null })).status).toBe(401);
    expect((await api('GET', '/api/admin/speaking/metrics', { perms: 'blog.view' })).status).toBe(403);
    const { status, json } = await api('GET', '/api/admin/speaking/metrics', { perms: 'speaking.view' });
    expect(status).toBe(200);
    expect(json.data.engagements[id].event_website_click).toEqual({ total: 1, recent: 1 });
    expect(json.data.page.enquiries).toEqual({ total: 1, recent: 1 });
    expect(json.data.page.profile_download).toEqual({ total: 0, recent: 0 });
    expect(resolveRouteAdminPermission({ path: '/api/admin/speaking/metrics', method: 'GET' })).toBe('speaking.view');
  });
});

describe('topics, media links and cancellations', () => {
  it('saves topics and media links, refusing unsafe links, and keeps them through partial updates', async () => {
    const bad = await api('POST', '/api/admin/speaking/engagements', {
      body: { event_title: 'Talk', media: [{ type: 'slides', url: 'javascript:alert(1)' }] },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.errors.media).toMatch(/Link 1/);

    const created = await createEngagement({
      event_title: 'Talk',
      topics: 'Leadership, leadership, Quality systems',
      media: [
        { type: 'recording', url: 'https://video.example.org/talk', label: '' },
        { type: '', url: '', label: '' },
      ],
    });
    expect(created.topics).toEqual(['Leadership', 'Quality systems']);
    expect(created.media).toEqual([{ type: 'recording', url: 'https://video.example.org/talk', label: null }]);

    const { json } = await api('PUT', `/api/admin/speaking/engagements/${created.id}`, { body: { description: 'Updated.' } });
    expect(json.data.topics).toEqual(['Leadership', 'Quality systems']);
    expect(json.data.media).toHaveLength(1);

    await api('POST', `/api/admin/speaking/engagements/${created.id}/publish`);
    const pub = await api('GET', `/api/speaking/engagements/${created.id}`, { perms: null });
    expect(pub.json.data.topics).toEqual(['Leadership', 'Quality systems']);
    expect(pub.json.data.media).toEqual([{ type: 'recording', url: 'https://video.example.org/talk', label: null }]);
  });

  it('lists past cancellations apart from the engagements that took place', async () => {
    for (const body of [
      { event_title: 'Took place', start_date: '2020-05-01' },
      { event_title: 'Called off', start_date: '2020-06-01', event_status: 'cancelled' },
      { event_title: 'Called off ahead', start_date: '2099-06-01', event_status: 'cancelled' },
    ]) {
      const { id } = await createEngagement(body);
      await api('POST', `/api/admin/speaking/engagements/${id}/publish`);
    }
    const { json } = await api('GET', '/api/speaking/engagements', { perms: null });
    expect(json.data.previous.map((e) => e.event_title)).toEqual(['Took place']);
    expect(json.data.cancelled.map((e) => e.event_title)).toEqual(['Called off']);
    // An upcoming cancellation stays in place, with its label.
    expect(json.data.upcoming.map((e) => [e.event_title, e.event_status])).toEqual([['Called off ahead', 'cancelled']]);
  });
});

describe('new enquiry count', () => {
  it('counts enquiries still marked New, for admins who handle enquiries', async () => {
    const first = await storedEnquiry();
    await sendEnquiry();
    const path = '/api/admin/speaking/enquiries-summary';
    expect((await api('GET', path, { perms: ENQUIRY_ADMIN })).json.data).toEqual({ new: 2 });

    await api('PUT', `/api/admin/speaking/enquiries/${first.id}`, { perms: ENQUIRY_ADMIN, body: { status: 'reviewing' } });
    expect((await api('GET', path, { perms: ENQUIRY_ADMIN })).json.data).toEqual({ new: 1 });
    expect((await api('GET', path, { perms: MANAGER })).status).toBe(403);
    expect(resolveRouteAdminPermission({ path, method: 'GET' })).toBe('speaking.enquiries');
  });
});

describe('speaker profile clean-up', () => {
  const NOW = Date.parse('2026-11-02T10:00:00Z');
  const name = (n) => `speaker-profile-${n}-0123abcd.pdf`;

  async function seed(files) {
    const folder = path.join(uploadsRoot, 'speaking');
    await fs.rm(folder, { recursive: true, force: true });
    await fs.mkdir(folder, { recursive: true });
    for (const [file, ageHours] of files) {
      const full = path.join(folder, file);
      await fs.writeFile(full, '%PDF-1.7');
      const time = new Date(NOW - ageHours * 3600_000);
      await fs.utimes(full, time, time);
    }
    return async () => (await fs.readdir(folder)).sort();
  }

  it('deletes the replaced file and stale unsaved uploads, keeping fresh ones and unrelated files', async () => {
    const list = await seed([[name(1), 48], [name(2), 0.1], [name(3), 1], [name(4), 72], ['notes.pdf', 72]]);
    const deleted = await pruneSpeakerProfiles({
      uploadsRoot,
      previousUrl: `/uploads/speaking/${name(1)}`,
      currentUrl: `/uploads/speaking/${name(2)}`,
      now: NOW,
    });
    expect(deleted.sort()).toEqual([name(1), name(4)]);
    expect(await list()).toEqual(['notes.pdf', name(2), name(3)].sort());
  });

  it('deletes the old file when the profile is removed, and ignores anything outside the pattern', async () => {
    const list = await seed([[name(5), 0.5]]);
    expect(await pruneSpeakerProfiles({ uploadsRoot, previousUrl: `/uploads/speaking/${name(5)}`, currentUrl: '', now: NOW }))
      .toEqual([name(5)]);
    expect(await list()).toEqual([]);
    expect(await pruneSpeakerProfiles({ uploadsRoot, previousUrl: '/uploads/speaking/../../server/index.js', now: NOW })).toEqual([]);
  });
});
