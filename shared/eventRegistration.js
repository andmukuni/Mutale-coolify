/** Shared event registration window helpers (client + server). */

function normalizeTimeString(value, fallback = '00:00:00') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return fallback;
}

export function buildEventDateTime(dateValue, timeValue, fallbackTime = '00:00:00') {
  const datePart = String(dateValue || '').trim();
  if (!datePart) return null;
  const normalizedTime = normalizeTimeString(timeValue, fallbackTime);
  const dt = new Date(`${datePart}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function getEventTimeBounds(event = {}) {
  const startDate = event.start_date || event.date;
  const endDate = event.end_date || startDate;

  const start = buildEventDateTime(startDate, event.start_time || event.time, '00:00:00');
  const end = buildEventDateTime(endDate, event.end_time || event.endTime, '23:59:59');

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
