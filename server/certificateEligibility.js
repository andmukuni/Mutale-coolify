/**
 * Certificate eligibility helpers (server copy — do not import from src/ on cPanel).
 */

function normalizeTimeString(value, fallback = '00:00:00') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return fallback;
}

export function getEventTimeBounds(event = {}) {
  const startDate = event.start_date || event.date;
  const endDate = event.end_date || startDate;
  const start = startDate
    ? new Date(`${String(startDate).trim()}T${normalizeTimeString(event.start_time || event.time, '00:00:00')}`)
    : null;
  const end = endDate
    ? new Date(`${String(endDate).trim()}T${normalizeTimeString(event.end_time || event.endTime, '23:59:59')}`)
    : null;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

export function isEventEnded(event, now = new Date()) {
  const { end } = getEventTimeBounds(event);
  if (!end) return false;
  return now > end;
}

export function isRegistrationEligibleForCertificate(reg) {
  if (!reg) return false;
  const status = String(reg.status || '').toLowerCase();
  if (status === 'cancelled') return false;
  const attended = status === 'attended' || Boolean(reg.attended_at);
  return attended;
}
