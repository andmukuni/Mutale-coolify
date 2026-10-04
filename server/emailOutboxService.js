import crypto from 'crypto';
import {
  DEFAULT_CAMPAIGN_SENDER,
  missingRequiredMergeValues,
  newCampaignId,
  normalizeCampaignEmail,
  renderMergeTemplate,
  sanitizeHttpUrl,
} from '../shared/emailCampaign.js';
import { collectResourceIds, compileDesignToHtml, compileDesignToText } from '../shared/emailDesignCompile.js';
import { getEventResource } from './eventResourceService.js';
import { previewCampaignAudience } from './emailAudienceService.js';
import { evaluateRecipientEligibility } from './emailConsentService.js';
import {
  getCampaign,
  getCampaignWithRevision,
  getRevision,
  transitionCampaign,
  writeAudit,
} from './emailCampaignService.js';
import { issueRegistrantGrant } from './eventResourceService.js';
import {
  getResendConfig,
  isCampaignLiveSendAllowed,
  sendResendEmail,
} from './emailResendAdapter.js';

function appOrigin() {
  return String(process.env.APP_URL || 'https://mutalemubanga.org').replace(/\/$/, '');
}

export function buildRecipientVars({ campaign, registration, grantUrl, preferenceToken }) {
  const origin = appOrigin();
  const first = String(registration?.booked_for_name || registration?.user_name || 'there').trim().split(/\s+/)[0] || 'there';
  const full = String(registration?.booked_for_name || registration?.user_name || 'Guest').trim();
  return {
    first_name: first,
    full_name: full,
    event_title: campaign.event_title || '',
    event_when: campaign.event_when || '',
    venue_or_join: campaign.venue_or_join || '',
    registration_ref: registration?.reference_code || '',
    resource_page_url: grantUrl || `${origin}/resources/${campaign.event_id}`,
    preferences_url: `${origin}/email/preferences?token=${encodeURIComponent(preferenceToken || '')}`,
    unsubscribe_url: `${origin}/email/unsubscribe?token=${encodeURIComponent(preferenceToken || '')}`,
  };
}

export function signPreferenceToken(email) {
  const secret = String(process.env.AUTH_TOKEN_SECRET || 'dev-email-pref').slice(0, 64);
  const payload = Buffer.from(JSON.stringify({
    email: normalizeCampaignEmail(email),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 90,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readPreferenceToken(token) {
  const secret = String(process.env.AUTH_TOKEN_SECRET || 'dev-email-pref').slice(0, 64);
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) throw new Error('Invalid preferences token.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid preferences token.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp && Date.now() > Number(data.exp)) throw new Error('This preferences link has expired.');
  return data;
}

async function loadEventContext(pool, eventId) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
  if (!event) throw new Error('Event not found.');
  const when = [event.start_date, event.start_time].filter(Boolean).join(' ');
  const venue = event.event_mode === 'virtual'
    ? (event.meeting_link || event.zoom_join_url || event.daily_room_url || '')
    : (event.venue || event.location || '');
  return {
    event,
    event_title: event.title,
    event_when: `${when}${event.timezone ? ` (${event.timezone})` : ''}`,
    venue_or_join: venue,
  };
}

export async function freezeRecipientSnapshot(pool, campaign, { onlyNew = false } = {}) {
  const preview = await previewCampaignAudience(pool, {
    eventId: campaign.event_id,
    segment: campaign.segment,
    purpose: campaign.purpose,
  });
  let skip = new Set();
  if (onlyNew) {
    const [existing] = await pool.query(
      'SELECT email_normalized FROM email_campaign_recipients WHERE campaign_id = ? AND included = 1',
      [campaign.id],
    );
    skip = new Set((existing || []).map((row) => row.email_normalized));
  } else {
    await pool.query('DELETE FROM email_campaign_recipients WHERE campaign_id = ?', [campaign.id]);
  }

  const inserted = [];
  for (const person of preview.included) {
    if (skip.has(person.email)) continue;
    const id = newCampaignId('ercp');
    await pool.query(
      `INSERT INTO email_campaign_recipients
        (id, campaign_id, registration_id, event_id, email_normalized, display_name, included, exclude_reason, outcome)
       VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 'pending')
       ON DUPLICATE KEY UPDATE registration_id = VALUES(registration_id)`,
      [id, campaign.id, person.registration_id, campaign.event_id, person.email, person.name],
    );
    inserted.push({ ...person, id });
  }
  for (const person of preview.excluded) {
    if (!person.email) continue;
    const id = newCampaignId('ercx');
    await pool.query(
      `INSERT INTO email_campaign_recipients
        (id, campaign_id, registration_id, event_id, email_normalized, included, exclude_reason, outcome)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'excluded')
       ON DUPLICATE KEY UPDATE exclude_reason = VALUES(exclude_reason)`,
      [id, campaign.id, person.registration_id || null, campaign.event_id, person.email, person.reason],
    );
  }
  return { preview, inserted };
}

export async function enqueueCampaign(pool, campaign, { scheduledAt = new Date(), actorId } = {}) {
  const { inserted } = await freezeRecipientSnapshot(pool, campaign);
  for (const person of inserted) {
    const [[row]] = await pool.query(
      'SELECT id FROM email_campaign_recipients WHERE campaign_id = ? AND email_normalized = ? LIMIT 1',
      [campaign.id, person.email],
    );
    if (!row) continue;
    await pool.query(
      `INSERT INTO email_outbox_jobs
        (id, campaign_id, recipient_id, registration_id, attempt_key, status, scheduled_at)
       VALUES (?, ?, ?, ?, 'send-1', 'queued', ?)
       ON DUPLICATE KEY UPDATE scheduled_at = VALUES(scheduled_at), status = 'queued'`,
      [newCampaignId('ejob'), campaign.id, row.id, person.registration_id, scheduledAt],
    );
  }
  await writeAudit(pool, { actorId, action: 'campaign.enqueued', campaignId: campaign.id, detail: `${inserted.length} recipients` });
  return inserted.length;
}

async function personalize(pool, campaign, recipient) {
  const ctx = await loadEventContext(pool, campaign.event_id);
  let registration = null;
  if (recipient.registration_id) {
    const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ? LIMIT 1', [recipient.registration_id]);
    registration = row || null;
  }
  const token = signPreferenceToken(recipient.email_normalized);
  const revision = await getRevision(pool, campaign.current_revision_id);
  let grantUrl = `${appOrigin()}/resources/${campaign.event_id}`;
  const resourceIds = collectResourceIds(revision?.design || { blocks: [] });
  for (const resourceId of resourceIds) {
    const resource = await getEventResource(pool, resourceId);
    if (!resource || String(resource.event_id) !== String(campaign.event_id) || !resource.is_published) continue;
    if (resource.access_mode === 'registrant_link') {
      const grant = await issueRegistrantGrant(pool, {
        resource,
        registrationId: recipient.registration_id,
      });
      grantUrl = `${appOrigin()}/resources/${campaign.event_id}/${resource.id}?token=${encodeURIComponent(grant.token)}`;
    } else if (resource.access_mode === 'public') {
      grantUrl = `${appOrigin()}/resources/${campaign.event_id}/${resource.id}`;
    }
  }
  const vars = buildRecipientVars({
    campaign: { ...campaign, ...ctx },
    registration,
    grantUrl,
    preferenceToken: token,
  });
  const subject = renderMergeTemplate(revision?.subject || campaign.subject, vars, { mode: 'text' });
  const html = compileDesignToHtml(revision?.design || { blocks: [] }, vars, { title: subject, previewText: campaign.preheader });
  const text = compileDesignToText(revision?.design || { blocks: [] }, vars);
  const missing = missingRequiredMergeValues(`${subject} ${text}`, vars);
  return { subject, html, text, vars, missing, registration };
}

export async function dispatchOutboxJob(pool, job, { sendFn = sendResendEmail, config = getResendConfig() } = {}) {
  const campaign = await getCampaign(pool, job.campaign_id);
  if (!campaign) return { status: 'failed', reason: 'Campaign missing.' };
  if (!['sending', 'scheduled'].includes(campaign.state) && campaign.state !== 'paused') {
    if (campaign.state === 'paused' || campaign.state === 'cancelled') {
      return { status: 'skipped', reason: `campaign_${campaign.state}` };
    }
  }
  if (['cancelled', 'paused', 'archived'].includes(campaign.state)) {
    return { status: 'skipped', reason: `campaign_${campaign.state}` };
  }

  const [[recipient]] = await pool.query('SELECT * FROM email_campaign_recipients WHERE id = ? LIMIT 1', [job.recipient_id]);
  if (!recipient || !recipient.included) return { status: 'skipped', reason: 'recipient_excluded' };

  const gate = await evaluateRecipientEligibility(pool, {
    email: recipient.email_normalized,
    purpose: campaign.purpose,
  });
  if (gate.blocked) {
    await pool.query(
      'UPDATE email_campaign_recipients SET outcome = ?, exclude_reason = ? WHERE id = ?',
      ['skipped', gate.reason, recipient.id],
    );
    return { status: 'skipped', reason: gate.reason };
  }

  if (recipient.registration_id) {
    const [[reg]] = await pool.query('SELECT status FROM event_registrations WHERE id = ? LIMIT 1', [recipient.registration_id]);
    if (!reg || reg.status === 'cancelled') {
      await pool.query(
        'UPDATE email_campaign_recipients SET outcome = ?, exclude_reason = ? WHERE id = ?',
        ['skipped', 'registration_cancelled', recipient.id],
      );
      return { status: 'skipped', reason: 'registration_cancelled' };
    }
  }

  const personalized = await personalize(pool, campaign, recipient);
  if (personalized.missing.length) {
    return { status: 'failed', reason: `Missing merge values: ${personalized.missing.join(', ')}` };
  }

  if (!config.apiKey) {
    return { status: 'failed', reason: 'RESEND_API_KEY is not configured.' };
  }
  if (!isCampaignLiveSendAllowed() && !config.live) {
    return { status: 'failed', reason: 'Live campaign sends are disabled until RESEND_LIVE_SENDS=1.' };
  }

  const headers = {};
  if (campaign.purpose === 'promotional') {
    const unsubPage = personalized.vars.unsubscribe_url;
    const parsed = new URL(unsubPage, appOrigin());
    const unsubApi = `${appOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(parsed.searchParams.get('token') || '')}`;
    if (sanitizeHttpUrl(unsubApi)) {
      headers['List-Unsubscribe'] = `<${unsubApi}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
  }

  if (campaign.state === 'scheduled') {
    await pool.query('UPDATE email_campaigns SET state = ? WHERE id = ?', ['sending', campaign.id]);
  }

  const result = await sendFn({
    config,
    to: recipient.email_normalized,
    subject: personalized.subject,
    html: personalized.html,
    text: personalized.text,
    fromName: campaign.from_name || DEFAULT_CAMPAIGN_SENDER.fromName,
    fromEmail: campaign.from_email || DEFAULT_CAMPAIGN_SENDER.fromEmail,
    replyTo: campaign.reply_to || DEFAULT_CAMPAIGN_SENDER.replyTo,
    headers,
    idempotencyKey: `${campaign.id}/${recipient.id}/send-1`,
    tags: { campaign_id: campaign.id, purpose: campaign.purpose },
  });

  if (result.status === 'accepted') {
    await pool.query(
      `UPDATE email_campaign_recipients
       SET outcome = 'accepted', provider_message_id = ?, sent_at = NOW()
       WHERE id = ?`,
      [result.providerMessageId || null, recipient.id],
    );
    return result;
  }
  if (result.status === 'acceptance_unknown') {
    await pool.query(
      `UPDATE email_campaign_recipients
       SET outcome = 'acceptance_unknown', error_reason = ?
       WHERE id = ?`,
      [result.reason, recipient.id],
    );
    return result;
  }
  await pool.query(
    `UPDATE email_campaign_recipients
     SET outcome = 'failed', error_reason = ?
     WHERE id = ?`,
    [result.reason || 'send_failed', recipient.id],
  );
  return result;
}

export async function claimNextOutboxJob(pool) {
  const token = newCampaignId('clm');
  const [queued] = await pool.query(
    `SELECT id FROM email_outbox_jobs
     WHERE status = 'queued' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT 1`,
  );
  const jobId = queued?.[0]?.id;
  if (!jobId) return null;
  const [result] = await pool.query(
    `UPDATE email_outbox_jobs
     SET status = 'claimed', claimed_at = NOW(), claim_token = ?, tries = tries + 1
     WHERE id = ? AND status = 'queued'`,
    [token, jobId],
  );
  if (!result?.affectedRows) return null;
  const [[job]] = await pool.query('SELECT * FROM email_outbox_jobs WHERE id = ? LIMIT 1', [jobId]);
  return job;
}

export async function processClaimedJob(pool, job, deps) {
  const result = await dispatchOutboxJob(pool, job, deps);
  if (result.status === 'accepted' || result.status === 'skipped') {
    await pool.query(
      'UPDATE email_outbox_jobs SET status = ?, provider_message_id = ?, last_error = ? WHERE id = ?',
      [result.status === 'accepted' ? 'sent' : 'skipped', result.providerMessageId || null, result.reason || null, job.id],
    );
  } else if (result.status === 'acceptance_unknown') {
    await pool.query(
      'UPDATE email_outbox_jobs SET status = ?, last_error = ? WHERE id = ?',
      ['acceptance_unknown', result.reason || null, job.id],
    );
  } else if (job.tries < 5 && result.status === 'failed') {
    await pool.query(
      `UPDATE email_outbox_jobs
       SET status = 'queued', scheduled_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), last_error = ?, claimed_at = NULL
       WHERE id = ?`,
      [Math.min(30, 2 ** job.tries), result.reason || 'retry', job.id],
    );
  } else {
    await pool.query(
      'UPDATE email_outbox_jobs SET status = ?, last_error = ? WHERE id = ?',
      ['dead', result.reason || 'failed', job.id],
    );
  }
  await refreshCampaignProgress(pool, job.campaign_id);
  return result;
}

export async function refreshCampaignProgress(pool, campaignId) {
  const [[totals]] = await pool.query(
    `SELECT
       SUM(status IN ('queued','claimed')) AS pending,
       SUM(status = 'sent') AS sent,
       SUM(status = 'dead') AS dead,
       SUM(status = 'skipped') AS skipped,
       COUNT(*) AS total
     FROM email_outbox_jobs WHERE campaign_id = ?`,
    [campaignId],
  );
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign || !['sending', 'scheduled'].includes(campaign.state)) return campaign;
  const pending = Number(totals?.pending || 0);
  const dead = Number(totals?.dead || 0);
  const sent = Number(totals?.sent || 0);
  if (pending > 0) return campaign;
  let next = 'completed';
  if (sent === 0 && dead > 0) next = 'failed';
  else if (dead > 0) next = 'partially_failed';
  if (canMove(campaign.state, next)) {
    await pool.query('UPDATE email_campaigns SET state = ? WHERE id = ?', [next, campaignId]);
  }
  return getCampaign(pool, campaignId);
}

function canMove(from, to) {
  return from !== to;
}

export async function runEmailOutboxTick(pool, deps) {
  const results = [];
  for (let i = 0; i < 8; i += 1) {
    const job = await claimNextOutboxJob(pool);
    if (!job) break;
    results.push(await processClaimedJob(pool, job, deps));
  }
  return results;
}

export async function startCampaignSend(pool, campaignId, { actorId, scheduleAt = null, confirmed = false } = {}) {
  const campaign = await getCampaignWithRevision(pool, campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (!confirmed) throw new Error('Live sends require explicit confirmation.');
  if (!campaign.revision) throw new Error('Save a design before sending.');
  if (!isCampaignLiveSendAllowed()) {
    throw new Error('Live campaign sends are disabled until RESEND_LIVE_SENDS=1 and the sending domain is verified.');
  }
  const when = scheduleAt ? new Date(scheduleAt) : new Date();
  const next = scheduleAt && when > new Date() ? 'scheduled' : 'sending';
  await enqueueCampaign(pool, campaign, { scheduledAt: when, actorId });
  return transitionCampaign(pool, campaignId, next, actorId, scheduleAt ? String(scheduleAt) : 'immediate');
}

export async function pauseCampaignJobs(pool, campaignId, actorId) {
  await pool.query(
    `UPDATE email_outbox_jobs SET status = 'paused'
     WHERE campaign_id = ? AND status = 'queued'`,
    [campaignId],
  );
  return transitionCampaign(pool, campaignId, 'paused', actorId);
}

export async function resumeCampaignJobs(pool, campaignId, actorId) {
  await pool.query(
    `UPDATE email_outbox_jobs SET status = 'queued', scheduled_at = NOW()
     WHERE campaign_id = ? AND status = 'paused'`,
    [campaignId],
  );
  return transitionCampaign(pool, campaignId, 'sending', actorId);
}

export async function cancelCampaignJobs(pool, campaignId, actorId) {
  await pool.query(
    `UPDATE email_outbox_jobs SET status = 'cancelled'
     WHERE campaign_id = ? AND status IN ('queued','paused')`,
    [campaignId],
  );
  return transitionCampaign(pool, campaignId, 'cancelled', actorId);
}

export async function sendCampaignTest(pool, campaignId, recipient, { sendFn = sendResendEmail, config = getResendConfig() } = {}) {
  const campaign = await getCampaignWithRevision(pool, campaignId);
  if (!campaign?.revision) throw new Error('Save a design before sending a test.');
  const vars = buildRecipientVars({
    campaign: {
      ...campaign,
      event_title: 'Demo event',
      event_when: '1 May 2027 09:00 (Africa/Lusaka)',
      venue_or_join: 'https://mutalemubanga.org/events/demo',
    },
    registration: { booked_for_name: 'Test Recipient', reference_code: 'MM-TEST-0001' },
    grantUrl: `${appOrigin()}/resources/demo`,
    preferenceToken: signPreferenceToken(recipient),
  });
  const subject = `[TEST] ${renderMergeTemplate(campaign.subject || 'Campaign test', vars)}`;
  const html = compileDesignToHtml(campaign.revision.design, vars, { title: subject, previewText: campaign.preheader });
  const text = compileDesignToText(campaign.revision.design, vars);
  if (!config.apiKey) throw new Error('RESEND_API_KEY is not configured.');
  return sendFn({
    config,
    to: recipient,
    subject,
    html,
    text,
    fromName: campaign.from_name,
    fromEmail: campaign.from_email,
    replyTo: campaign.reply_to,
    idempotencyKey: `test/${campaign.id}/${Date.now()}`,
    tags: { campaign_id: campaign.id, kind: 'test' },
  });
}

export { issueRegistrantGrant };
