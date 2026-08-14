const DEFAULT_TIMEZONE = 'Africa/Lusaka';

function normalizeDatePart(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizeTimePart(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

function compactDate(datePart) {
  return normalizeDatePart(datePart).replace(/-/g, '');
}

function compactDateTime(datePart, timePart) {
  return `${compactDate(datePart)}T${normalizeTimePart(timePart).replace(/:/g, '')}`;
}

function addHoursToLocal(datePart, timePart, hours) {
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = normalizeTimePart(timePart || '00:00:00').split(':').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hour, minute, second) + hours * 3600 * 1000);
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const nextTime = `${String(next.getUTCHours()).padStart(2, '0')}:${String(next.getUTCMinutes()).padStart(2, '0')}:${String(next.getUTCSeconds()).padStart(2, '0')}`;
  return { datePart: nextDate, timePart: nextTime };
}

function addDays(datePart, days) {
  const [year, month, day] = datePart.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Google Calendar template URL using the event's local wall-clock time and timezone.
 * Returns '' when the event has no usable start date.
 */
export function buildGoogleCalendarUrl(event = {}, { detailsUrl = '' } = {}) {
  const startDate = normalizeDatePart(event.start_date || event.date);
  if (!startDate) return '';

  const startTime = normalizeTimePart(event.start_time || event.time);
  const endDate = normalizeDatePart(event.end_date) || startDate;
  const endTime = normalizeTimePart(event.end_time);
  const timezone = String(event.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const allDay = !startTime;

  let dates;
  if (allDay) {
    dates = `${compactDate(startDate)}/${compactDate(addDays(endDate, 1))}`;
  } else {
    let resolvedEndDate = endDate;
    let resolvedEndTime = endTime;
    if (!resolvedEndTime) {
      const shifted = addHoursToLocal(startDate, startTime, 2);
      resolvedEndDate = shifted.datePart;
      resolvedEndTime = shifted.timePart;
    } else if (endDate === startDate && resolvedEndTime <= startTime) {
      const shifted = addHoursToLocal(startDate, startTime, 2);
      resolvedEndDate = shifted.datePart;
      resolvedEndTime = shifted.timePart;
    }
    dates = `${compactDateTime(startDate, startTime)}/${compactDateTime(resolvedEndDate, resolvedEndTime)}`;
  }

  const details = [
    String(event.short_description || event.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
    detailsUrl ? `More details: ${detailsUrl}` : '',
  ].filter(Boolean).join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: String(event.title || 'Event').trim() || 'Event',
    dates,
    ctz: timezone,
    location: String(event.location || event.venue || '').trim(),
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** @deprecated Use buildGoogleCalendarUrl */
export function buildGoogleCalendarLink(event = {}, fallbackUrl = '') {
  return buildGoogleCalendarUrl(event, { detailsUrl: fallbackUrl }) || fallbackUrl;
}
