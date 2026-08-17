/** Shared event registration window helpers (client + server). */

export const DEFAULT_EVENT_TIMEZONE = 'Africa/Lusaka';

function normalizeTimeString(value, fallback = '00:00:00') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const fallbackMatch = String(fallback || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!fallbackMatch) return '00:00:00';
    return `${String(fallbackMatch[1]).padStart(2, '0')}:${fallbackMatch[2]}:${fallbackMatch[3] || '00'}`;
  }
  return `${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

function resolveEventTimeZone(eventOrZone) {
  if (typeof eventOrZone === 'string') {
    return eventOrZone.trim() || DEFAULT_EVENT_TIMEZONE;
  }
  const zone = String(eventOrZone?.timezone || '').trim();
  return zone || DEFAULT_EVENT_TIMEZONE;
}

function timezoneOffsetMs(instant, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant).reduce((map, part) => {
      map[part.type] = part.value;
      return map;
    }, {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    const wallAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`);
    if (Number.isNaN(wallAsUtc.getTime())) return null;
    return wallAsUtc.getTime() - instant.getTime();
  } catch {
    return null;
  }
}

/**
 * Convert a wall-clock date/time in `timeZone` to an absolute Date.
 * Event times are stored as local clock values (e.g. 19:30 Africa/Lusaka), not UTC.
 */
export function zonedWallTimeToUtc(
  dateValue,
  timeValue,
  timeZone = DEFAULT_EVENT_TIMEZONE,
  fallbackTime = '00:00:00',
) {
  const datePart = String(dateValue || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const normalizedTime = normalizeTimeString(timeValue, fallbackTime);
  const tz = resolveEventTimeZone(timeZone);
  const asIfUtc = new Date(`${datePart}T${normalizedTime}Z`);
  if (Number.isNaN(asIfUtc.getTime())) return null;

  const firstOffset = timezoneOffsetMs(asIfUtc, tz);
  if (firstOffset == null) return asIfUtc;

  let instant = new Date(asIfUtc.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMs(instant, tz);
  if (secondOffset != null && secondOffset !== firstOffset) {
    instant = new Date(asIfUtc.getTime() - secondOffset);
  }
  return instant;
}

export function buildEventDateTime(dateValue, timeValue, fallbackTime = '00:00:00', timeZone = DEFAULT_EVENT_TIMEZONE) {
  return zonedWallTimeToUtc(dateValue, timeValue, timeZone, fallbackTime);
}

export function getEventTimeBounds(event = {}) {
  const startDate = event.start_date || event.date;
  const endDate = event.end_date || startDate;
  const timeZone = resolveEventTimeZone(event);

  const start = buildEventDateTime(startDate, event.start_time || event.time, '00:00:00', timeZone);
  const end = buildEventDateTime(endDate, event.end_time || event.endTime, '23:59:59', timeZone);

  return { start, end };
}

export function isEventEnded(event, now = new Date()) {
  const { end } = getEventTimeBounds(event);
  if (!end) return false;
  return now > end;
}

export function isEventOngoing(event, now = new Date()) {
  const { start, end } = getEventTimeBounds(event);
  if (!start || !end) return false;
  return now >= start && now <= end;
}

export function getRegistrationDeadlineDateTime(event) {
  if (!event?.registration_deadline) return null;
  return buildEventDateTime(
    event.registration_deadline,
    event.registration_deadline_time,
    event.registration_deadline_time ? '00:00:00' : '23:59:59',
    resolveEventTimeZone(event),
  );
}

/**
 * Event-level registration gate (status, visibility, schedule, deadline).
 * Does not check capacity, duplicates, or booking type.
 * @returns {string|null} Block reason, or null when registration may proceed.
 */
export function getEventRegistrationGateReason(event, now = new Date()) {
  if (!event) return 'Event not found.';

  const rawStatus = String(event.status || 'published').toLowerCase();
  if (rawStatus === 'cancelled') return 'This event has been cancelled.';
  if (rawStatus === 'closed') return 'Registration for this event is closed.';
  if (rawStatus === 'draft') return 'This event is not available for registration.';
  if (rawStatus !== 'published' && rawStatus !== 'upcoming' && rawStatus !== 'ongoing' && rawStatus !== 'past') {
    return 'This event is not available for registration.';
  }

  const visibility = String(event.visibility || 'public').toLowerCase();
  if (visibility === 'private') return 'This is a private event.';

  if (isEventEnded(event, now)) return 'This event has ended.';

  // While the event is live, keep registration open until capacity is reached or the event ends.
  if (!isEventOngoing(event, now)) {
    const deadline = getRegistrationDeadlineDateTime(event);
    if (deadline && now > deadline) {
      return 'The registration deadline for this event has passed.';
    }
  }

  return null;
}
