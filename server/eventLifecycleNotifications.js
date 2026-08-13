import { getEventTimeBounds } from '../shared/eventRegistration.js';
import {
  isTicketPaymentEligible,
  resolveAttendeeEmail,
  resolveAttendeeName,
  resolveAttendeePhone,
} from '../shared/ticketViewModel.js';
import { buildPersonTemplateVars } from '../shared/notificationTemplates.js';

export const LIFECYCLE_LOOKBACK_MS = 48 * 60 * 60 * 1000;
export const LIFECYCLE_KINDS = {
  started: 'started',
  ended: 'ended',
};

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveAppOrigin() {
  return String(process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

export function remindersEnabled(settings = {}) {
  return parseBoolean(settings?.notifications?.emailOnEventReminder, true);
}

export function shouldNotifyKind(event = {}, kind, now = new Date(), lookbackMs = LIFECYCLE_LOOKBACK_MS) {
  const status = String(event.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'draft') return false;

  const { start, end } = getEventTimeBounds(event);
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

export function buildLifecycleMessages({ event = {}, registration = {}, kind, appOrigin } = {}) {
  const name = resolveAttendeeName(registration);
  const title = String(event.title || 'the event').trim();
  const origin = String(appOrigin || resolveAppOrigin()).replace(/\/$/, '');
  const eventUrl = event.slug ? `${origin}/events/${encodeURIComponent(event.slug)}` : origin;
  const ref = String(registration.reference_code || '').trim();
  const ticketUrl = ref ? `${origin}/tickets/${encodeURIComponent(ref)}` : '';
  const when = formatWhen(event);
  const started = kind === LIFECYCLE_KINDS.started;

  const subject = started
    ? `${title} has started`
    : `Thank you for attending ${title}`;

  const text = started
    ? [
      `Hi ${name},`,
      '',
      `"${title}" has started.`,
      when ? `Schedule: ${when}` : '',
      '',
      ticketUrl ? `Your ticket: ${ticketUrl}` : '',
      `Event page: ${eventUrl}`,
      '',
      'We look forward to seeing you.',
      '',
      'Mutale Mubanga',
    ].filter(Boolean).join('\n')
    : [
      `Hi ${name},`,
      '',
      `"${title}" has now ended. Thank you for attending.`,
      when ? `Schedule: ${when}` : '',
      '',
      ticketUrl ? `Your ticket and any certificates: ${ticketUrl}` : `Event page: ${eventUrl}`,
      '',
      'Best regards,',
      'Mutale Mubanga',
    ].filter(Boolean).join('\n');

  const smsMessage = started
    ? [`${title} has started.`, ticketUrl || eventUrl].filter(Boolean).join(' ')
    : [`${title} has ended. Thank you for attending.`, ticketUrl || eventUrl].filter(Boolean).join(' ');

  return {
    subject,
    text,
    smsMessage,
    smsTo: resolveAttendeePhone(registration),
    to: resolveAttendeeEmail(registration),
    eventUrl,
    ticketUrl,
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
  } = deps;
  const summary = {
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
    const kinds = [LIFECYCLE_KINDS.started, LIFECYCLE_KINDS.ended]
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
          const message = buildLifecycleMessages({ event, registration, kind, appOrigin });
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
            templateSlug: kind === LIFECYCLE_KINDS.started ? 'event_started' : 'event_ended',
            templateVars: {
              ...buildPersonTemplateVars(resolveAttendeeName(registration)),
              event_title: event.title,
              ticket_url: message.ticketUrl,
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
            if (kind === LIFECYCLE_KINDS.started) summary.started += 1;
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
