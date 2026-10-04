import {
  CAMPAIGN_PURPOSES,
  DEFAULT_CAMPAIGN_SENDER,
  canTransitionCampaign,
  newCampaignId,
  sanitizeSegment,
  stripHeaderInjection,
} from '../shared/emailCampaign.js';
import { compileDesignToHtml, compileDesignToText, normalizeDesignDocument } from '../shared/emailDesignCompile.js';
import { blankCampaignDesign } from '../shared/emailDesignTemplates.js';

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    segment: parseJson(row.segment_json, sanitizeSegment()),
  };
}

export async function writeAudit(pool, { actorId, action, campaignId = null, resourceId = null, detail = '' }) {
  await pool.query(
    `INSERT INTO email_audit_log (id, actor_id, action, campaign_id, resource_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newCampaignId('eaud'), actorId || null, action, campaignId, resourceId, String(detail || '').slice(0, 400)],
  );
}

export async function listCampaigns(pool, { eventId = '', state = '' } = {}) {
  const clauses = [];
  const params = [];
  if (eventId) {
    clauses.push('event_id = ?');
    params.push(eventId);
  }
  if (state) {
    clauses.push('state = ?');
    params.push(state);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM email_campaigns ${where} ORDER BY updated_at DESC`,
    params,
  );
  return (rows || []).map(mapCampaign);
}

export async function getCampaign(pool, id) {
  const [[row]] = await pool.query('SELECT * FROM email_campaigns WHERE id = ? LIMIT 1', [id]);
  return mapCampaign(row);
}

export async function getRevision(pool, id) {
  if (!id) return null;
  const [[row]] = await pool.query('SELECT * FROM email_campaign_revisions WHERE id = ? LIMIT 1', [id]);
  if (!row) return null;
  return { ...row, design: parseJson(row.design_json, blankCampaignDesign()), immutable: Boolean(Number(row.immutable)) };
}

export async function createCampaign(pool, {
  eventId,
  name,
  purpose = CAMPAIGN_PURPOSES.event_service,
  actorId,
  timezone = 'Africa/Lusaka',
}) {
  const id = newCampaignId('ecmp');
  const safePurpose = purpose === CAMPAIGN_PURPOSES.promotional
    ? CAMPAIGN_PURPOSES.promotional
    : CAMPAIGN_PURPOSES.event_service;
  await pool.query(
    `INSERT INTO email_campaigns
      (id, event_id, name, purpose, state, from_name, from_email, reply_to, segment_json, timezone, created_by)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      eventId,
      String(name || 'Untitled campaign').trim(),
      safePurpose,
      DEFAULT_CAMPAIGN_SENDER.fromName,
      DEFAULT_CAMPAIGN_SENDER.fromEmail,
      DEFAULT_CAMPAIGN_SENDER.replyTo,
      JSON.stringify(sanitizeSegment()),
      timezone || 'Africa/Lusaka',
      actorId || null,
    ],
  );
  await saveRevision(pool, {
    campaignId: id,
    design: blankCampaignDesign(),
    subject: '',
    preheader: '',
    actorId,
  });
  await writeAudit(pool, { actorId, action: 'campaign.created', campaignId: id });
  return getCampaignWithRevision(pool, id);
}

export async function saveRevision(pool, { campaignId, design, subject, preheader, actorId }) {
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (!['draft', 'scheduled', 'paused'].includes(campaign.state)) {
    throw new Error('Sent content is locked. Duplicate the campaign to send a revision.');
  }
  const current = await getRevision(pool, campaign.current_revision_id);
  if (current?.immutable) throw new Error('This revision is locked.');
  const normalized = normalizeDesignDocument(design);
  const html = compileDesignToHtml(normalized, {}, { title: subject, previewText: preheader });
  const text = compileDesignToText(normalized, {});
  const id = newCampaignId('erev');
  await pool.query(
    `INSERT INTO email_campaign_revisions
      (id, campaign_id, design_json, html_body, text_body, subject, preheader, immutable)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, campaignId, JSON.stringify(normalized), html, text, stripHeaderInjection(subject), stripHeaderInjection(preheader)],
  );
  await pool.query(
    `UPDATE email_campaigns
     SET current_revision_id = ?, subject = ?, preheader = ?
     WHERE id = ?`,
    [id, stripHeaderInjection(subject), stripHeaderInjection(preheader), campaignId],
  );
  await writeAudit(pool, { actorId, action: 'campaign.saved', campaignId, detail: id });
  return getCampaignWithRevision(pool, campaignId);
}

export async function updateCampaignDetails(pool, id, payload = {}, actorId) {
  const campaign = await getCampaign(pool, id);
  if (!campaign) throw new Error('Campaign not found.');
  if (!['draft', 'scheduled'].includes(campaign.state)) {
    throw new Error('Only draft or scheduled campaigns can change details.');
  }
  const purpose = payload.purpose === CAMPAIGN_PURPOSES.promotional
    ? CAMPAIGN_PURPOSES.promotional
    : (payload.purpose || campaign.purpose);
  const segment = sanitizeSegment(payload.segment || campaign.segment);
  await pool.query(
    `UPDATE email_campaigns
     SET name = ?, purpose = ?, from_name = ?, from_email = ?, reply_to = ?, segment_json = ?, timezone = ?, scheduled_at = ?
     WHERE id = ?`,
    [
      String(payload.name || campaign.name).trim(),
      purpose,
      stripHeaderInjection(payload.from_name || campaign.from_name),
      stripHeaderInjection(payload.from_email || campaign.from_email),
      stripHeaderInjection(payload.reply_to || campaign.reply_to),
      JSON.stringify(segment),
      payload.timezone || campaign.timezone || 'Africa/Lusaka',
      payload.scheduled_at || null,
      id,
    ],
  );
  if (payload.design || payload.subject != null || payload.preheader != null) {
    const revision = await getRevision(pool, campaign.current_revision_id);
    await saveRevision(pool, {
      campaignId: id,
      design: payload.design || revision?.design,
      subject: payload.subject != null ? payload.subject : campaign.subject,
      preheader: payload.preheader != null ? payload.preheader : campaign.preheader,
      actorId,
    });
  }
  await writeAudit(pool, { actorId, action: 'campaign.updated', campaignId: id });
  return getCampaignWithRevision(pool, id);
}

export async function transitionCampaign(pool, id, nextState, actorId, detail = '') {
  const campaign = await getCampaign(pool, id);
  if (!campaign) throw new Error('Campaign not found.');
  if (!canTransitionCampaign(campaign.state, nextState)) {
    throw new Error(`Cannot move a ${campaign.state} campaign to ${nextState}.`);
  }
  await pool.query('UPDATE email_campaigns SET state = ? WHERE id = ?', [nextState, id]);
  if (['sending', 'scheduled'].includes(nextState) && campaign.current_revision_id) {
    await pool.query('UPDATE email_campaign_revisions SET immutable = 1 WHERE id = ?', [campaign.current_revision_id]);
  }
  await writeAudit(pool, { actorId, action: `campaign.${nextState}`, campaignId: id, detail });
  return getCampaignWithRevision(pool, id);
}

export async function duplicateCampaign(pool, id, actorId) {
  const current = await getCampaignWithRevision(pool, id);
  if (!current) throw new Error('Campaign not found.');
  const copy = await createCampaign(pool, {
    eventId: current.event_id,
    name: `${current.name} (copy)`,
    purpose: current.purpose,
    actorId,
    timezone: current.timezone,
  });
  await pool.query('UPDATE email_campaigns SET parent_campaign_id = ? WHERE id = ?', [id, copy.id]);
  await saveRevision(pool, {
    campaignId: copy.id,
    design: current.revision?.design || blankCampaignDesign(),
    subject: current.subject,
    preheader: current.preheader,
    actorId,
  });
  await writeAudit(pool, { actorId, action: 'campaign.duplicated', campaignId: copy.id, detail: id });
  return getCampaignWithRevision(pool, copy.id);
}

export async function getCampaignWithRevision(pool, id) {
  const campaign = await getCampaign(pool, id);
  if (!campaign) return null;
  const revision = await getRevision(pool, campaign.current_revision_id);
  const [audit] = await pool.query(
    'SELECT * FROM email_audit_log WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 20',
    [id],
  );
  return { ...campaign, revision, activity: audit || [] };
}

export async function listDesignTemplates(pool) {
  const [rows] = await pool.query('SELECT * FROM email_design_templates ORDER BY name ASC');
  return (rows || []).map((row) => ({
    ...row,
    design: parseJson(row.design_json, blankCampaignDesign()),
  }));
}
