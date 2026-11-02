import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { getActiveEmailFooter } from '../shared/emailFooter.js';
import { permissionMatches } from '../shared/rbacPermissions.js';
import { buildPersonTemplateVars, getSystemTemplate, renderTemplate } from '../shared/notificationTemplates.js';
import {
  buildEnquirySummary,
  enquiryGreeting,
  greetingFirstName,
  normalizeEnquiryReply,
} from '../shared/speakingEnquiries.js';
import { rateLimitByKey } from './securityHelpers.js';
import {
  checkEnquiryToken,
  countNewEnquiries,
  createDraftFromEnquiry,
  createEnquiry,
  deleteEnquiry,
  getEnquiry,
  hashIp,
  issueEnquiryToken,
  listEnquiries,
  markEnquiryReplied,
  recordEnquiryEmailStatus,
  reviewEnquiry,
} from './speakingEnquiryService.js';
import {
  createEngagement,
  deleteEngagement,
  duplicateEngagement,
  getAdminEngagement,
  getPublicEngagement,
  listAdminEngagements,
  listPublicEngagements,
  setPublicationState,
  updateEngagement,
} from './speakingService.js';
import {
  ENQUIRY_METRIC,
  isEngagementMetric,
  normalizeMetric,
  recordMetric,
  summarizeMetrics,
} from './speakingMetricsService.js';

const VALIDATION_MESSAGE = 'Please fix the highlighted fields.';

// Base64 adds a third, so this keeps the JSON body under the 10 MB parser limit.
export const MAX_SPEAKER_PROFILE_BYTES = 7 * 1024 * 1024;

/** Accept only a real PDF sent as a data URL. */
export function parsePdfDataUrl(value) {
  const match = String(value || '').match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return { error: 'Upload a PDF file.' };
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_SPEAKER_PROFILE_BYTES) return { error: 'The PDF must be 7 MB or smaller.' };
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'That file is not a valid PDF.' };
  return { buffer };
}
const SPEAKER_PROFILE_NAME = /^speaker-profile-\d+-[0-9a-f]{8}\.pdf$/;
const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;

const profileFileName = (url) => {
  const match = String(url || '').match(/\/uploads\/speaking\/(speaker-profile-\d+-[0-9a-f]{8}\.pdf)(?:[?#].*)?$/);
  return match ? match[1] : '';
};

/**
 * Whether a speaker-profile URL still points at a file on disk. URLs that aren't
 * one of our uploads (for example an external link) are left to the caller.
 */
export async function speakerProfileExists(uploadsRoot, url) {
  const name = profileFileName(url);
  if (!name) return true;
  return fs.access(path.join(uploadsRoot, 'speaking', name)).then(() => true, () => false);
}

/**
 * Remove speaker-profile PDFs the page no longer uses: the previously saved file
 * once it has been replaced or removed, and uploads that were never saved once
 * they are a day old (so a file someone is still about to save is left alone).
 * @returns {Promise<string[]>} the deleted file names
 */
export async function pruneSpeakerProfiles({ uploadsRoot, previousUrl = '', currentUrl = '', now = Date.now() }) {
  const folder = path.join(uploadsRoot, 'speaking');
  const keep = profileFileName(currentUrl);
  const replaced = profileFileName(previousUrl);
  let names;
  try {
    names = await fs.readdir(folder);
  } catch {
    return [];
  }
  const deleted = [];
  for (const name of names) {
    if (!SPEAKER_PROFILE_NAME.test(name) || name === keep) continue;
    const file = path.join(folder, name);
    if (name !== replaced) {
      const { mtimeMs } = await fs.stat(file).catch(() => ({ mtimeMs: now }));
      if (now - mtimeMs < ABANDONED_UPLOAD_AGE_MS) continue;
    }
    await fs.unlink(file).then(() => deleted.push(name), () => {});
  }
  return deleted;
}

const NOT_FOUND = { ok: false, message: 'Speaking engagement not found.' };

/** Anonymous visitors get the friendly message only; the cause goes to the server log. */
function publicFailure(res, message, error) {
  console.error(`[speaking] ${message} ${error?.message || error}`);
  return res.status(500).json({ ok: false, message });
}

/** The eight groups of an IPv6 address, with '::' expanded and leading zeros dropped. */
function ipv6Groups(ip) {
  const toGroups = (part) => part.split(':').filter(Boolean).flatMap((group) => {
    if (!group.includes('.')) return [group];
    // An IPv4 address written into the last 32 bits, e.g. 64:ff9b::192.0.2.1.
    const [a, b, c, d] = group.split('.').map(Number);
    return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
  });
  const [head, tail] = ip.split('::');
  const left = toGroups(head);
  const right = tail === undefined ? [] : toGroups(tail);
  return [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    .map((group) => parseInt(group, 16).toString(16));
}

/**
 * Rate-limit key for a visitor. An IPv6 connection usually controls a whole
 * /64, so every address in it counts as one visitor; an IPv4-mapped address
 * (::ffff:192.0.2.1) counts as the plain IPv4 address.
 */
export function clientRateKey(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || '').trim().replace(/%.*$/, '');
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  if (!net.isIPv6(ip)) return ip || 'unknown';
  return `${ipv6Groups(ip).slice(0, 4).join(':')}::/64`;
}

/** Allows `max` calls in any rolling hour, then returns false until the oldest one is an hour old. */
export function createHourlyCap(max) {
  const times = [];
  return (now = Date.now()) => {
    while (times.length && now - times[0] >= 60 * 60_000) times.shift();
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
}

// Site-wide, so posts from many addresses can't turn the form into a mail
// relay. Past it the enquiry is still stored and the admin still alerted.
export const ACKNOWLEDGEMENTS_PER_HOUR = 20;
const ACK_LIMIT_NOTE = 'No acknowledgement was emailed to the organiser: the hourly limit on acknowledgements was reached. Reply to them yourself if the enquiry is genuine.';

// Organisers have not subscribed to anything, so their emails carry no
// subscription wording and no "Manage my subscriptions" link.
export const ORGANISER_EMAIL_NOTICE = 'You are receiving this email because you sent a speaking enquiry through this website. You have not been added to any mailing list.';
const organiserFooter = () => ({ ...getActiveEmailFooter(), manageLabel: '', notice: ORGANISER_EMAIL_NOTICE });

/** The built-in wording, sent as-is if the template is switched off in Admin → Templates. */
function catalogEmail(slug, vars) {
  const template = getSystemTemplate(slug, 'email');
  return { subject: renderTemplate(template.subject, vars), text: renderTemplate(template.body, vars) };
}

/**
 * The global admin middleware already gates /api/admin/*. This repeats the
 * check per route so the module stays safe even if that path rule changes.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ ok: false, message: 'Authentication required.' });
    }
    if (!permissionMatches(req.adminUser.permissions || [], permission)) {
      return res.status(403).json({
        ok: false,
        message: 'You do not have permission to perform this action.',
        required_permission: permission,
      });
    }
    return next();
  };
}

function sendResult(res, result, successStatus = 200) {
  if (result.notFound) return res.status(404).json(NOT_FOUND);
  if (result.errors) return res.status(400).json({ ok: false, message: VALIDATION_MESSAGE, errors: result.errors });
  if (result.conflict) return res.status(409).json({ ok: false, message: result.conflict });
  return res.status(successStatus).json({ ok: true, data: result.engagement });
}

// Field a person never sees; anything typed into it marks the post as automated.
export const ENQUIRY_HONEYPOT_FIELD = 'leave_this_blank';

export function registerSpeakingRoutes(app, {
  pool,
  generateEntityId,
  uploadImage,
  uploadsRoot,
  tokenSecret,
  getSystemSettings,
  sendEmailNotification,
  resolvePublicAppUrl = () => '',
  fallbackAdminEmail = () => '',
  enquiryRateLimit = rateLimitByKey({
    routeKey: 'speaking-enquiries',
    windowMs: 60 * 60_000,
    max: 5,
    getKey: clientRateKey,
  }),
  metricsRateLimit = rateLimitByKey({
    routeKey: 'speaking-metrics',
    windowMs: 10 * 60_000,
    max: 60,
    getKey: clientRateKey,
  }),
  allowAcknowledgement = createHourlyCap(ACKNOWLEDGEMENTS_PER_HOUR),
} = {}) {
  const canView = requirePermission('speaking.view');
  const canManage = requirePermission('speaking.manage');
  const canManageWebsite = requirePermission('website.manage');
  const canHandleEnquiries = requirePermission('speaking.enquiries');

  /**
   * Notify the configured administrator and acknowledge the organiser. Never throws.
   * The admin gets the full enquiry. The organiser gets fixed wording and a
   * greeting from a plain first name only: the form is public and anyone can
   * type someone else's address, so nothing else they typed is repeated.
   */
  async function sendEnquiryEmails(req, enquiry) {
    const settings = await getSystemSettings();
    const acknowledge = allowAcknowledgement();
    const summary = buildEnquirySummary(enquiry);
    const adminTo = String(
      settings?.notifications?.adminAlertEmail || settings?.email?.replyTo || fallbackAdminEmail() || '',
    ).trim();
    const adminVars = {
      ...buildPersonTemplateVars(enquiry.organiser_name),
      event_title: enquiry.event_title,
      organisation: enquiry.organisation,
      enquiry_summary: acknowledge ? summary : `${summary}\n\n${ACK_LIMIT_NOTE}`,
      admin_url: `${resolvePublicAppUrl(req)}/admin/speaking-enquiries`,
    };
    const ackVars = {
      greeting: enquiryGreeting(enquiry.organiser_name),
      first_name: greetingFirstName(enquiry.organiser_name),
    };
    const send = (slug, to, vars, options = {}) => sendEmailNotification({
      settings,
      to,
      ...catalogEmail(slug, vars),
      kind: slug,
      templateSlug: slug,
      templateVars: vars,
      skipSms: true,
      ...options,
    });
    const [admin, ack] = await Promise.allSettled([
      send('speaking_enquiry_admin', adminTo, adminVars),
      acknowledge
        ? send('speaking_enquiry_ack', enquiry.email, ackVars, { footer: organiserFooter() })
        : Promise.resolve({ status: 'limited' }),
    ]);
    const outcome = (result) => (result.status === 'fulfilled' ? result.value?.status || 'failed' : 'failed');
    return { admin: outcome(admin), ack: outcome(ack) };
  }
  const actorOf = (req) => String(req.adminUser?.sub || req.adminUser?.email || '') || null;

  // ── Public ─────────────────────────────────────────────────────────────────

  app.get('/api/speaking/engagements', async (_req, res) => {
    try {
      return res.json({ ok: true, data: await listPublicEngagements(pool) });
    } catch (error) {
      return publicFailure(res, 'Failed to load speaking engagements.', error);
    }
  });

  app.get('/api/speaking/engagements/:id', async (req, res) => {
    try {
      const engagement = await getPublicEngagement(pool, req.params.id);
      if (!engagement) return res.status(404).json(NOT_FOUND);
      return res.json({ ok: true, data: engagement });
    } catch (error) {
      return publicFailure(res, 'Failed to load the speaking engagement.', error);
    }
  });

  // Counts are sent only after the visitor accepts analytics cookies. The reply
  // is the same whether or not anything was counted, so it reveals nothing
  // about unpublished engagements.
  app.post('/api/speaking/metrics', metricsRateLimit, async (req, res) => {
    try {
      const metric = normalizeMetric(req.body || {});
      if (metric.error) return res.status(400).json({ ok: false, message: metric.error });
      if (!isEngagementMetric(metric.metric) || await getPublicEngagement(pool, metric.engagementId)) {
        await recordMetric(pool, metric);
      }
      return res.status(204).end();
    } catch (error) {
      return publicFailure(res, 'Failed to record.', error);
    }
  });

  app.get('/api/speaking/enquiry-token', (_req, res) => res.json({ ok: true, token: issueEnquiryToken(tokenSecret) }));

  app.post('/api/speaking/enquiries', enquiryRateLimit, async (req, res) => {
    try {
      const body = req.body || {};
      // Look successful to bots so they don't learn what tripped them; store nothing.
      if (String(body[ENQUIRY_HONEYPOT_FIELD] || '').trim()) {
        return res.status(201).json({ ok: true, data: { acknowledgementSent: true } });
      }
      // The form keeps what was typed and fetches a fresh token after a
      // rejection, so pressing Send again is all the visitor needs to do.
      // A missing or forged token is reported as expired, like a stale one.
      const tokenState = checkEnquiryToken(body.form_token, tokenSecret);
      if (tokenState !== 'ok') {
        const tooFast = tokenState === 'too_fast';
        return res.status(400).json({
          ok: false,
          code: tooFast ? 'token_too_fast' : 'token_expired',
          message: tooFast
            ? 'That was sent very quickly. Please wait a moment, then press Send again.'
            : 'This form has expired. Please press Send again.',
        });
      }

      const result = await createEnquiry(pool, body, {
        id: generateEntityId('spq'),
        ipHash: hashIp(req.ip || req.socket?.remoteAddress, tokenSecret),
      });
      if (result.errors) return res.status(400).json({ ok: false, message: VALIDATION_MESSAGE, errors: result.errors });
      await recordMetric(pool, { metric: ENQUIRY_METRIC, engagementId: '' })
        .catch((error) => console.warn(`[speaking-enquiry] count failed: ${error.message}`));

      const emails = await sendEnquiryEmails(req, result.enquiry).catch((error) => {
        console.warn(`[speaking-enquiry] email failed: ${error.message}`);
        return { admin: 'failed', ack: 'failed' };
      });
      await recordEnquiryEmailStatus(pool, result.enquiry.id, emails);

      return res.status(201).json({ ok: true, data: { acknowledgementSent: emails.ack === 'sent' } });
    } catch (error) {
      return publicFailure(res, 'Your enquiry could not be sent. Please try again.', error);
    }
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  // For the badge beside "Enquiries" in the admin sidebar.
  app.get('/api/admin/speaking/enquiries-summary', canHandleEnquiries, async (_req, res) => {
    try {
      return res.json({ ok: true, data: { new: await countNewEnquiries(pool) } });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to count speaking enquiries.', error: error.message });
    }
  });

  app.get('/api/admin/speaking/enquiries', canHandleEnquiries, async (_req, res) => {
    try {
      return res.json({ ok: true, data: await listEnquiries(pool) });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load speaking enquiries.', error: error.message });
    }
  });

  app.get('/api/admin/speaking/enquiries/:id', canHandleEnquiries, async (req, res) => {
    try {
      const enquiry = await getEnquiry(pool, req.params.id);
      if (!enquiry) return res.status(404).json({ ok: false, message: 'Enquiry not found.' });
      return res.json({ ok: true, data: enquiry });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load the enquiry.', error: error.message });
    }
  });

  app.put('/api/admin/speaking/enquiries/:id', canHandleEnquiries, async (req, res) => {
    try {
      const result = await reviewEnquiry(pool, req.params.id, req.body || {});
      if (result.notFound) return res.status(404).json({ ok: false, message: 'Enquiry not found.' });
      if (result.errors) return res.status(400).json({ ok: false, message: VALIDATION_MESSAGE, errors: result.errors });
      return res.json({ ok: true, data: result.enquiry });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to update the enquiry.', error: error.message });
    }
  });

  // Sent from the site's own email settings, like replies to contact messages.
  app.post('/api/admin/speaking/enquiries/:id/reply', canHandleEnquiries, async (req, res) => {
    try {
      const enquiry = await getEnquiry(pool, req.params.id);
      if (!enquiry) return res.status(404).json({ ok: false, message: 'Enquiry not found.' });
      const { value, errors } = normalizeEnquiryReply(req.body || {});
      if (Object.keys(errors).length) return res.status(400).json({ ok: false, message: VALIDATION_MESSAGE, errors });

      const sent = await sendEmailNotification({
        settings: await getSystemSettings(),
        to: enquiry.email,
        subject: value.subject,
        text: value.message,
        kind: 'speaking_enquiry_reply',
        skipSms: true,
        footer: organiserFooter(),
      });
      if (sent?.status !== 'sent') {
        return res.status(502).json({
          ok: false,
          message: sent?.reason || 'The reply could not be sent. Check Settings → Email and try again.',
        });
      }
      return res.json({ ok: true, data: await markEnquiryReplied(pool, enquiry) });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to send the reply.', error: error.message });
    }
  });

  app.delete('/api/admin/speaking/enquiries/:id', canHandleEnquiries, async (req, res) => {
    try {
      if (!(await deleteEnquiry(pool, req.params.id))) return res.status(404).json({ ok: false, message: 'Enquiry not found.' });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to delete the enquiry.', error: error.message });
    }
  });

  app.post('/api/admin/speaking/enquiries/:id/create-draft', canHandleEnquiries, canManage, async (req, res) => {
    try {
      const result = await createDraftFromEnquiry(pool, req.params.id, {
        newId: generateEntityId('spk'),
        actor: actorOf(req),
      });
      if (result.notFound) return res.status(404).json({ ok: false, message: 'Enquiry not found.' });
      if (result.conflict) return res.status(409).json({ ok: false, message: result.conflict });
      if (result.errors) return res.status(400).json({ ok: false, message: VALIDATION_MESSAGE, errors: result.errors });
      return res.status(201).json({ ok: true, data: { engagement: result.engagement, enquiry: result.enquiry } });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to create the draft engagement.', error: error.message });
    }
  });

  app.get('/api/admin/speaking/metrics', canView, async (_req, res) => {
    try {
      return res.json({ ok: true, data: await summarizeMetrics(pool) });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load speaking activity.', error: error.message });
    }
  });

  app.get('/api/admin/speaking/engagements', canView, async (_req, res) => {
    try {
      return res.json({ ok: true, data: await listAdminEngagements(pool) });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load speaking engagements.', error: error.message });
    }
  });

  app.get('/api/admin/speaking/engagements/:id', canView, async (req, res) => {
    try {
      const engagement = await getAdminEngagement(pool, req.params.id);
      if (!engagement) return res.status(404).json(NOT_FOUND);
      return res.json({ ok: true, data: engagement });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load the speaking engagement.', error: error.message });
    }
  });

  app.post('/api/admin/speaking/engagements', canManage, async (req, res) => {
    try {
      const result = await createEngagement(pool, req.body || {}, {
        id: generateEntityId('spk'),
        actor: actorOf(req),
      });
      return sendResult(res, result, 201);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to save the speaking engagement.', error: error.message });
    }
  });

  app.put('/api/admin/speaking/engagements/:id', canManage, async (req, res) => {
    try {
      const result = await updateEngagement(pool, req.params.id, req.body || {}, { actor: actorOf(req) });
      return sendResult(res, result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to update the speaking engagement.', error: error.message });
    }
  });

  app.post('/api/admin/speaking/engagements/:id/duplicate', canManage, async (req, res) => {
    try {
      const result = await duplicateEngagement(pool, req.params.id, {
        newId: generateEntityId('spk'),
        actor: actorOf(req),
      });
      return sendResult(res, result, 201);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to duplicate the speaking engagement.', error: error.message });
    }
  });

  app.post('/api/admin/speaking/engagements/:id/publish', canManage, async (req, res) => {
    try {
      const result = await setPublicationState(pool, req.params.id, 'published', { actor: actorOf(req) });
      return sendResult(res, result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to publish the speaking engagement.', error: error.message });
    }
  });

  app.post('/api/admin/speaking/engagements/:id/hide', canManage, async (req, res) => {
    try {
      const result = await setPublicationState(pool, req.params.id, 'hidden', { actor: actorOf(req) });
      return sendResult(res, result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to hide the speaking engagement.', error: error.message });
    }
  });

  // Event images and organiser logos. Separate from /api/site-images so speaking
  // managers don't need website-wide permissions.
  app.post('/api/admin/speaking/upload-image', canManage, async (req, res) => {
    try {
      const image = req.body?.image;
      if (!image) return res.status(400).json({ ok: false, message: 'Image data is required.' });
      const url = await uploadImage(image, req);
      if (!url || String(url).startsWith('data:')) {
        return res.status(400).json({ ok: false, message: 'Invalid image payload.' });
      }
      const relative = String(url).includes('/uploads/') ? `/uploads/${String(url).split('/uploads/')[1]}` : url;
      return res.json({ ok: true, url: relative });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to upload image.', error: error.message });
    }
  });

  // The speaker profile is page content (edited in Admin → Sections), so it
  // follows the website permission rather than the engagement one.
  app.post('/api/admin/speaking/speaker-profile', canManageWebsite, async (req, res) => {
    try {
      const { buffer, error } = parsePdfDataUrl(req.body?.file);
      if (error) return res.status(400).json({ ok: false, message: error });
      const folder = path.join(uploadsRoot, 'speaking');
      await fs.mkdir(folder, { recursive: true });
      const name = `speaker-profile-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
      await fs.writeFile(path.join(folder, name), buffer);
      return res.json({ ok: true, url: `/uploads/speaking/${name}` });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to upload the speaker profile.', error: error.message });
    }
  });

  app.delete('/api/admin/speaking/engagements/:id', canManage, async (req, res) => {
    try {
      const deleted = await deleteEngagement(pool, req.params.id);
      if (!deleted) return res.status(404).json(NOT_FOUND);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to delete the speaking engagement.', error: error.message });
    }
  });
}
