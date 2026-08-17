import { DEFAULT_EVENT_TIMEZONE, zonedWallTimeToUtc } from '../shared/eventRegistration.js';

/** Zoom scheduled meetings reject durations over 24 hours. */
export const ZOOM_MAX_MEETING_DURATION_MINUTES = 1440;
const DEFAULT_DURATION_MINUTES = 90;
const DEFAULT_TIMEZONE = DEFAULT_EVENT_TIMEZONE;

export function normalizeDatePart(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function normalizeTimePart(value, fallback = '00:00:00') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const fallbackMatch = String(fallback || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!fallbackMatch) return '00:00:00';
    return `${String(fallbackMatch[1]).padStart(2, '0')}:${fallbackMatch[2]}:${fallbackMatch[3] || '00'}`;
  }
  return `${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

function zonedDateTimeToUtc(datePart, timePart, timezone = DEFAULT_TIMEZONE) {
  return zonedWallTimeToUtc(datePart, timePart, timezone, '00:00:00');
}

export function toZoomDateTime(event = {}) {
  const datePart = normalizeDatePart(event.start_date);
  if (!datePart) return null;
  return zonedDateTimeToUtc(
    datePart,
    event.start_time || '00:00:00',
    event.timezone || DEFAULT_TIMEZONE,
  );
}

export function formatZoomLocalDateTime(event = {}) {
  const datePart = normalizeDatePart(event.start_date);
  if (!datePart) return '';
  return `${datePart}T${normalizeTimePart(event.start_time)}`;
}

export function toEventDurationMinutes(event = {}) {
  const start = toZoomDateTime(event);
  if (!start) return DEFAULT_DURATION_MINUTES;

  const endDatePart = normalizeDatePart(event.end_date || event.start_date);
  const endTimeRaw = String(event.end_time || '').trim();
  if (!endDatePart || !endTimeRaw) return DEFAULT_DURATION_MINUTES;

  const end = zonedDateTimeToUtc(endDatePart, endTimeRaw, event.timezone || DEFAULT_TIMEZONE);
  if (!end) return DEFAULT_DURATION_MINUTES;

  const duration = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION_MINUTES;
}

/** Duration sent to Zoom create/update. Join windows should use toEventDurationMinutes instead. */
export function toZoomMeetingDurationMinutes(event = {}) {
  return Math.min(toEventDurationMinutes(event), ZOOM_MAX_MEETING_DURATION_MINUTES);
}

export function resolveZoomHostEmail({ bodyHostEmail = '', event = {}, zoomConfig = {} } = {}) {
  return String(
    bodyHostEmail
    || event.zoom_host_email
    || zoomConfig.defaultHostEmail
    || event.organizer_email
    || '',
  ).trim();
}

export function isZoomUserMissingError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('user does not exist')
    || message.includes('user not found')
    || message.includes('does not belong to this account');
}

export function formatZoomApiError(parsed, status) {
  const base = parsed?.message || parsed?.reason || `Zoom request failed (${status}).`;
  const details = Array.isArray(parsed?.errors)
    ? parsed.errors.map((item) => item?.message || item?.field || JSON.stringify(item)).filter(Boolean).join('; ')
    : '';
  return details ? `${base} ${details}` : base;
}

export function buildZoomMeetingPayload(event = {}, options = {}) {
  const source = {
    ...event,
    start_date: options.startDate || event.start_date,
    start_time: options.startTime || event.start_time,
    end_date: options.endDate || event.end_date,
    end_time: options.endTime || event.end_time,
    timezone: event.timezone || DEFAULT_TIMEZONE,
  };

  const startTime = formatZoomLocalDateTime(source);
  if (!startTime) return null;

  const topicBase = String(event.title || 'Mutale Event').trim() || 'Mutale Event';
  const suffix = String(options.titleSuffix || '').trim();
  const topic = (suffix ? `${topicBase} — ${suffix}` : topicBase).slice(0, 200);
  const password = String(options.password || '').trim() || undefined;

  return {
    topic,
    type: 2,
    agenda: String(event.short_description || event.description || '').slice(0, 1500),
    start_time: startTime,
    duration: toZoomMeetingDurationMinutes(source),
    timezone: String(source.timezone || DEFAULT_TIMEZONE),
    password,
    settings: {
      waiting_room: options.waitingRoom !== false,
      join_before_host: Boolean(options.joinBeforeHost),
    },
  };
}
