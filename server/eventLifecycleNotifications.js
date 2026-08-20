import { getEventTimeBounds } from '../shared/eventRegistration.js';
import {
  isTicketPaymentEligible,
  resolveAttendeeEmail,
  resolveAttendeeName,
  resolveAttendeePhone,
} from '../shared/ticketViewModel.js';
import { buildPersonTemplateVars } from '../shared/notificationTemplates.js';
import { resolvePublicAppUrl } from './publicAppUrl.js';
import { issueGuestLinkBundle } from '../shared/guestAccessToken.js';

export const LIFECYCLE_LOOKBACK_MS = 48 * 60 * 60 * 1000;
export const REMINDER_LEAD_MS = 15 * 60 * 1000;
export const LIFECYCLE_KINDS = {
  startingSoon: 'starting_soon',
  started: 'started',
  ended: 'ended',
};

function templateSlugForKind(kind) {
  if (kind === LIFECYCLE_KINDS.startingSoon) return 'event_starting_soon';
  if (kind === LIFECYCLE_KINDS.started) return 'event_started';
  if (kind === LIFECYCLE_KINDS.ended) return 'event_ended';
  return '';
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveAppOrigin() {
  return resolvePublicAppUrl();
}

export function remindersEnabled(settings = {}) {
  return parseBoolean(settings?.notifications?.emailOnEventReminder, true);
}

export function shouldNotifyKind(event = {}, kind, now = new Date(), lookbackMs = LIFECYCLE_LOOKBACK_MS) {
  const status = String(event.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'draft') return false;

  const { start, end } = getEventTimeBounds(event);
  if (kind === LIFECYCLE_KINDS.startingSoon) {
    if (!start || now >= start) return false;
    return start.getTime() - now.getTime() <= REMINDER_LEAD_MS;
  }
  if (kind === LIFECYCLE_KINDS.started) {
    if (!start || now < start) return false;
    if (end && now > end) return false;
    return true;
  }
  if (kind === LIFECYCLE_KINDS.ended) {
    if (!end || now <= end) return false;
    if (now.getTime() - end.getTime() > lookbackMs) return false;
    return true;
  }
  return false;
}

export function isLifecycleRegistrationEligible(registration = {}) {
  return isTicketPaymentEligible(registration);
}

function formatWhen(event = {}) {
  const date = String(event.start_date || event.date || '').slice(0, 10);
  const start = String(event.start_time || '').slice(0, 5);
  const end = String(event.end_time || '').slice(0, 5);
  const zone = String(event.timezone || 'Africa/Lusaka').trim();
  const time = [start, end].filter(Boolean).join(' – ');
  return [date, time, zone].filter(Boolean).join(' · ');
}

export function buildLifecycleMessages({
  event = {},
  registration = {},
  kind,
  appOrigin,
  signJwtHmacSha256,
  authSecret,
} = {}) {
  const name = resolveAttendeeName(registration);
  const title = String(event.title || 'the event').trim();
  const origin = String(appOrigin || resolveAppOrigin()).replace(/\/$/, '');
  const eventUrl = event.slug
    ? `${origin}/events/${encodeURIComponent(event.slug)}`
    : origin;
  const links = issueGuestLinkBundle({
    registration,
    event,
    origin,
    signJwtHmacSha256,
    authSecret,
  });
  const ticketUrl = links.ticket_url;
  const joinUrl = links.join_url;
  const surveyUrl = links.survey_url;
  const when = formatWhen(event);
  const link = (kind === LIFECYCLE_KINDS.ended ? surveyUrl : joinUrl) || ticketUrl || eventUrl;

  let subject;
  let text;
  let smsMessage;

  if (kind === LIFECYCLE_KINDS.startingSoon) {
    subject = `${title} starts in 15 minutes`;
    text = [
      `Hi ${name},`,
      '',
      `"${title}" starts in 15 minutes.`,
      when ? `Schedule: ${when}` : '',
      '',
      joinUrl ? `Join with your guest token: ${joinUrl}` : '',
      ticketUrl ? `Your ticket: ${ticketUrl}` : '',
      eventUrl ? `Event page: ${eventUrl}` : '',
      '',
      'We look forward to seeing you.',
      '',
      'Mutale Mubanga',
    ].filter(Boolean).join('\n');
    smsMessage = [`${title} starts in 15 minutes.`, link].filter(Boolean).join(' ');
  } else if (kind === LIFECYCLE_KINDS.started) {
    subject = `${title} has started`;
    text = [
      `Hi ${name},`,
      '',
      `"${title}" has started.`,
      when ? `Schedule: ${when}` : '',
      '',
      joinUrl ? `Join with your guest token: ${joinUrl}` : '',
      ticketUrl ? `Your ticket: ${ticketUrl}` : '',
      eventUrl ? `Event page: ${eventUrl}` : '',
      '',
      'We look forward to seeing you.',
      '',
      'Mutale Mubanga',
    ].filter(Boolean).join('\n');
    smsMessage = [`${title} has started.`, link].filter(Boolean).join(' ');
  } else {
    subject = `Thank you for attending ${title}`;
    text = [
      `Hi ${name},`,
      '',
      `"${title}" has now ended. Thank you for attending.`,
      when ? `Schedule: ${when}` : '',
      '',
      surveyUrl ? `Please complete this short survey: ${surveyUrl}` : '',
      ticketUrl ? `Your ticket and any certificates: ${ticketUrl}` : (eventUrl ? `Event page: ${eventUrl}` : ''),
      '',
      'Best regards,',
      'Mutale Mubanga',
    ].filter(Boolean).join('\n');
    smsMessage = [`${title} has ended. Please share feedback:`, link].filter(Boolean).join(' ');
  }

  return {
    subject,
    text,
    smsMessage,
    smsTo: resolveAttendeePhone(registration),
    to: resolveAttendeeEmail(registration),
    eventUrl,
    ticketUrl,
    joinUrl,
    surveyUrl,
  };
}

function newRowId(kind, registrationId) {
  return `eln-${kind}-${String(registrationId || '').slice(0, 60)}`;
}

async function alreadySent(pool, registrationId, kind) {
  const [[row]] = await pool.query(
    `SELECT id FROM event_lifecycle_notifications
     WHERE registration_id = ? AND kind = ? AND email_status = 'sent'
     LIMIT 1`,
    [registrationId, kind],
  );
  return Boolean(row);
}

async function recordAttempt(pool, { eventId, registrationId, kind, emailStatus, smsStatus, error }) {
  const id = newRowId(kind, registrationId);
  await pool.query(
    `INSERT INTO event_lifecycle_notifications
      (id, event_id, registration_id, kind, email_status, sms_status, sent_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ${emailStatus === 'sent' ? 'NOW()' : 'NULL'}, ?)
     ON DUPLICATE KEY UPDATE
       email_status = VALUES(email_status),
       sms_status = VALUES(sms_status),
       sent_at = VALUES(sent_at),
       error = VALUES(error)`,
    [id, eventId, registrationId, kind, emailStatus, smsStatus || null, error || null],
  );
}

export async function processEventLifecycleNotifications(pool, deps = {}, now = new Date()) {
  const {
    getSystemSettings,
    sendEmailNotification,
    appOrigin = resolveAppOrigin(),
    signJwtHmacSha256,
    authSecret,
  } = deps;
  const summary = {
    startingSoon: 0,
    started: 0,
    ended: 0,
    emailed: 0,
    sms: 0,
    skipped: 0,
    errors: 0,
  };

  const settings = await getSystemSettings();
  if (!remindersEnabled(settings)) {
    return { ...summary, skippedReason: 'Event start/end reminders are disabled.' };
  }

  const [events] = await pool.query('SELECT * FROM events');
  for (const event of Array.isArray(events) ? events : []) {
    const kinds = [LIFECYCLE_KINDS.startingSoon, LIFECYCLE_KINDS.started, LIFECYCLE_KINDS.ended]
      .filter((kind) => shouldNotifyKind(event, kind, now));
    if (!kinds.length) continue;

    const [regs] = await pool.query(
      'SELECT * FROM event_registrations WHERE event_id = ?',
      [event.id],
    );
    const eligible = (Array.isArray(regs) ? regs : []).filter(isLifecycleRegistrationEligible);

    for (const registration of eligible) {
      for (const kind of kinds) {
        try {
          if (await alreadySent(pool, registration.id, kind)) {
            summary.skipped += 1;
            continue;
          }
          const message = buildLifecycleMessages({
            event,
            registration,
            kind,
            appOrigin,
            signJwtHmacSha256,
            authSecret,
          });
          if (!message.to) {
            summary.skipped += 1;
            await recordAttempt(pool, {
              eventId: event.id,
              registrationId: registration.id,
              kind,
              emailStatus: 'skipped',
              error: 'No attendee email.',
            });
            continue;
          }

          const result = await sendEmailNotification({
            settings,
            to: message.to,
            subject: message.subject,
            text: message.text,
            smsTo: message.smsTo,
            smsMessage: message.smsMessage,
            kind: 'event_reminder',
            templateSlug: templateSlugForKind(kind),
            templateVars: {
              ...buildPersonTemplateVars(resolveAttendeeName(registration)),
              event_title: event.title,
              ticket_url: message.ticketUrl,
              join_url: message.joinUrl,
              survey_url: message.surveyUrl,
              event_url: message.eventUrl,
            },
          });

          const emailStatus = result?.status || 'failed';
          const smsResults = Array.isArray(result?.sms) ? result.sms : [];
          const smsSent = smsResults.some((item) => item?.status === 'sent');
          await recordAttempt(pool, {
            eventId: event.id,
            registrationId: registration.id,
            kind,
            emailStatus,
            smsStatus: smsSent ? 'sent' : (smsResults[0]?.status || null),
            error: emailStatus === 'sent' ? null : (result?.reason || 'Email delivery failed.'),
          });

          if (emailStatus === 'sent') {
            summary.emailed += 1;
            if (kind === LIFECYCLE_KINDS.startingSoon) summary.startingSoon += 1;
            else if (kind === LIFECYCLE_KINDS.started) summary.started += 1;
            else summary.ended += 1;
            if (smsSent) summary.sms += 1;
          } else if (emailStatus === 'skipped') {
            summary.skipped += 1;
          } else {
            summary.errors += 1;
          }
        } catch (error) {
          summary.errors += 1;
          console.error('[event-lifecycle] notify failed', event.id, registration.id, kind, error.message);
        }
      }
    }
  }

  return summary;
}
