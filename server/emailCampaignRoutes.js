import {
  CAMPAIGN_MERGE_TAGS,
  MARKETING_CONSENT_WORDING,
  MARKETING_CONSENT_VERSION,
} from '../shared/emailCampaign.js';
import { collectRequiredDestinations } from '../shared/emailDesignCompile.js';
import { previewCampaignAudience } from './emailAudienceService.js';
import {
  createCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignWithRevision,
  listCampaigns,
  listDesignTemplates,
  saveRevision,
  updateCampaignDetails,
} from './emailCampaignService.js';
import {
  cancelCampaignJobs,
  pauseCampaignJobs,
  readPreferenceToken,
  resumeCampaignJobs,
  sendCampaignTest,
  signPreferenceToken,
  startCampaignSend,
} from './emailOutboxService.js';
import {
  getEmailPreference,
  marketingConsentCopy,
  recordMarketingOptIn,
  recordUnsubscribe,
} from './emailConsentService.js';
import {
  addResourceVersion,
  createEventResource,
  getEventResource,
  listEventResources,
  readResourceFile,
  resolveResourceAccess,
  revokeRegistrationGrants,
  setResourcePublished,
} from './eventResourceService.js';
import { getCampaignReport, ingestResendWebhook } from './emailWebhookService.js';
import { getResendConfig } from './emailResendAdapter.js';

function actorId(req) {
  return req.adminUser?.sub || req.adminUser?.id || req.adminUser?.email || null;
}

function requireCampaignEvent(campaign, eventId) {
  if (eventId && String(campaign.event_id) !== String(eventId)) {
    const error = new Error('That campaign belongs to another event.');
    error.status = 403;
    throw error;
  }
}

export function registerEmailCampaignRoutes(app, { pool, getAdminAuth, sendAuthFailure, __appRoot }) {
  app.get('/api/admin/campaigns/provider-status', async (_req, res) => {
    const config = getResendConfig();
    return res.json({
      ok: true,
      data: {
        configured: Boolean(config.apiKey),
        live: Boolean(config.live),
        webhook_configured: Boolean(config.webhookSecret),
        notice: config.live
          ? 'Live audience sends are enabled.'
          : 'Sandbox mode: test sends need an API key. Audience sends stay blocked until RESEND_LIVE_SENDS=1.',
      },
    });
  });

  app.get('/api/admin/events/:eventId/campaigns', async (req, res) => {
    try {
      const data = await listCampaigns(pool, { eventId: req.params.eventId });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/admin/campaigns', async (req, res) => {
    try {
      const data = await listCampaigns(pool, {
        eventId: String(req.query.event_id || ''),
        state: String(req.query.state || ''),
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/admin/campaigns/templates', async (_req, res) => {
    const data = await listDesignTemplates(pool);
    return res.json({ ok: true, data, mergeTags: CAMPAIGN_MERGE_TAGS });
  });

  app.post('/api/admin/campaigns', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.event_id) return res.status(400).json({ ok: false, message: 'event_id is required.' });
      const data = await createCampaign(pool, {
        eventId: body.event_id,
        name: body.name,
        purpose: body.purpose,
        actorId: actorId(req),
        timezone: body.timezone,
      });
      return res.status(201).json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/admin/campaigns/:id', async (req, res) => {
    const data = await getCampaignWithRevision(pool, req.params.id);
    if (!data) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    return res.json({ ok: true, data, mergeTags: CAMPAIGN_MERGE_TAGS });
  });

  app.put('/api/admin/campaigns/:id', async (req, res) => {
    try {
      const data = await updateCampaignDetails(pool, req.params.id, req.body || {}, actorId(req));
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/revision', async (req, res) => {
    try {
      const body = req.body || {};
      const data = await saveRevision(pool, {
        campaignId: req.params.id,
        design: body.design,
        subject: body.subject,
        preheader: body.preheader,
        actorId: actorId(req),
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/duplicate', async (req, res) => {
    try {
      const data = await duplicateCampaign(pool, req.params.id, actorId(req));
      return res.status(201).json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/audience-preview', async (req, res) => {
    try {
      const campaign = await getCampaign(pool, req.params.id);
      if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
      requireCampaignEvent(campaign, req.body?.event_id);
      const data = await previewCampaignAudience(pool, {
        eventId: campaign.event_id,
        segment: req.body?.segment || campaign.segment,
        purpose: campaign.purpose,
      });
      return res.json({
        ok: true,
        data: {
          ...data,
          notice: 'The count can change before sending. Recipients are frozen at dispatch.',
        },
      });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/test', async (req, res) => {
    try {
      const recipient = String(req.body?.recipient || '').trim();
      if (!recipient.includes('@')) return res.status(400).json({ ok: false, message: 'Enter a test email address.' });
      const data = await sendCampaignTest(pool, req.params.id, recipient);
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/send', async (req, res) => {
    try {
      const data = await startCampaignSend(pool, req.params.id, {
        actorId: actorId(req),
        scheduleAt: req.body?.scheduled_at || null,
        confirmed: Boolean(req.body?.confirmed),
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/pause', async (req, res) => {
    try {
      const data = await pauseCampaignJobs(pool, req.params.id, actorId(req));
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/resume', async (req, res) => {
    try {
      const data = await resumeCampaignJobs(pool, req.params.id, actorId(req));
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/campaigns/:id/cancel', async (req, res) => {
    try {
      const data = await cancelCampaignJobs(pool, req.params.id, actorId(req));
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/admin/campaigns/:id/report', async (req, res) => {
    const campaign = await getCampaign(pool, req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    const data = await getCampaignReport(pool, campaign.id);
    return res.json({ ok: true, data });
  });

  app.get('/api/admin/events/:eventId/resources', async (req, res) => {
    const data = await listEventResources(pool, req.params.eventId);
    return res.json({ ok: true, data });
  });

  app.post('/api/admin/events/:eventId/resources', async (req, res) => {
    try {
      const data = await createEventResource(pool, {
        eventId: req.params.eventId,
        title: req.body?.title,
        description: req.body?.description,
        accessMode: req.body?.access_mode,
        availableFrom: req.body?.available_from || null,
        availableUntil: req.body?.available_until || null,
        createdBy: actorId(req),
      });
      return res.status(201).json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/events/:eventId/resources/:id/revoke', async (req, res) => {
    const resource = await getEventResource(pool, req.params.id);
    if (!resource || String(resource.event_id) !== String(req.params.eventId)) {
      return res.status(404).json({ ok: false, message: 'Resource not found.' });
    }
    await revokeRegistrationGrants(pool, { resourceId: resource.id });
    return res.json({ ok: true });
  });

  app.post('/api/admin/events/:eventId/resources/:id/publish', async (req, res) => {
    const resource = await getEventResource(pool, req.params.id);
    if (!resource || String(resource.event_id) !== String(req.params.eventId)) {
      return res.status(404).json({ ok: false, message: 'Resource not found.' });
    }
    const data = await setResourcePublished(pool, resource.id, req.body?.published !== false);
    return res.json({ ok: true, data });
  });

  app.post('/api/admin/events/:eventId/resources/:id/upload', async (req, res) => {
    try {
      const resource = await getEventResource(pool, req.params.id);
      if (!resource || String(resource.event_id) !== String(req.params.eventId)) {
        return res.status(404).json({ ok: false, message: 'Resource not found.' });
      }
      const file = req.body?.file || {};
      const buffer = file.content_base64
        ? Buffer.from(String(file.content_base64), 'base64')
        : null;
      const data = await addResourceVersion(pool, {
        resource,
        buffer,
        originalName: file.name,
        mimeType: file.type,
        appRoot: __appRoot,
        externalUrl: req.body?.external_url || '',
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/webhooks/resend', async (req, res) => {
    try {
      const result = await ingestResendWebhook(pool, {
        rawBody: req.rawBody || JSON.stringify(req.body || {}),
        headers: req.headers,
        secret: getResendConfig().webhookSecret,
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/email/preferences', async (req, res) => {
    try {
      const parsed = readPreferenceToken(String(req.query.token || ''));
      const preference = await getEmailPreference(pool, parsed.email);
      return res.json({
        ok: true,
        data: {
          email: parsed.email,
          preference,
          consent: marketingConsentCopy(),
        },
      });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/email/preferences', async (req, res) => {
    try {
      const parsed = readPreferenceToken(String(req.body?.token || req.query.token || ''));
      if (req.body?.marketing_opt_in) {
        await recordMarketingOptIn(pool, parsed.email, { source: 'preferences' });
      }
      if (req.body?.unsubscribe) {
        await recordUnsubscribe(pool, parsed.email, { source: 'preferences' });
      }
      const preference = await getEmailPreference(pool, parsed.email);
      return res.json({ ok: true, data: { email: parsed.email, preference } });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/email/unsubscribe', async (req, res) => {
    try {
      const parsed = readPreferenceToken(String(req.body?.token || req.query.token || ''));
      await recordUnsubscribe(pool, parsed.email, { source: 'one_click' });
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/events/:eventId/resources/public', async (req, res) => {
    const resources = await listEventResources(pool, req.params.eventId);
    return res.json({
      ok: true,
      data: resources
        .filter((item) => item.is_published && item.access_mode === 'public')
        .map((item) => ({
          id: item.id,
          event_id: item.event_id,
          title: item.title,
          description: item.description,
          access_mode: item.access_mode,
          available_from: item.available_from,
          available_until: item.available_until,
        })),
    });
  });

  app.get('/api/event-resources/:id', async (req, res) => {
    try {
      const access = await resolveResourceAccess(pool, {
        token: String(req.query.token || ''),
        resourceId: req.params.id,
        method: 'GET',
      });
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
      return res.json({
        ok: true,
        data: {
          id: access.resource.id,
          event_id: access.resource.event_id,
          title: access.resource.title,
          description: access.resource.description,
          access_mode: access.resource.access_mode,
          expired: false,
        },
      });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get('/api/event-resources/:id/download', async (req, res) => {
    try {
      const access = await resolveResourceAccess(pool, {
        token: String(req.query.token || ''),
        resourceId: req.params.id,
        method: req.method,
      });
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
      const file = await readResourceFile(pool, access.resource, __appRoot);
      if (file.kind === 'link') return res.redirect(file.url);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${String(file.name).replace(/"/g, '')}"`);
      return res.send(file.buffer);
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.head('/api/event-resources/:id/download', async (req, res) => {
    const access = await resolveResourceAccess(pool, {
      token: String(req.query.token || ''),
      resourceId: req.params.id,
      method: 'HEAD',
    });
    if (!access.ok) return res.status(access.status).end();
    return res.status(200).end();
  });

  void collectRequiredDestinations;
  void MARKETING_CONSENT_WORDING;
  void MARKETING_CONSENT_VERSION;
  void getAdminAuth;
  void sendAuthFailure;
  void signPreferenceToken;
}
