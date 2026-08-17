import { eventMapLabel, parseEventCoords } from './eventMaps.js';

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

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveCalendarSchedule(event = {}) {
  const startDate = normalizeDatePart(event.start_date || event.date);
  if (!startDate) return null;

  const startTime = normalizeTimePart(event.start_time || event.time);
  const endDate = normalizeDatePart(event.end_date) || startDate;
  const endTime = normalizeTimePart(event.end_time);
  const timezone = String(event.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const allDay = !startTime;

  if (allDay) {
    return {
      startDate,
      startTime: '',
      endDate: addDays(endDate, 1),
      endTime: '',
      timezone,
      allDay: true,
    };
  }

  let resolvedEndDate = endDate;
  let resolvedEndTime = endTime;
  if (!resolvedEndTime || (endDate === startDate && resolvedEndTime <= startTime)) {
    const shifted = addHoursToLocal(startDate, startTime, 2);
    resolvedEndDate = shifted.datePart;
    resolvedEndTime = shifted.timePart;
  }

  return {
    startDate,
    startTime,
    endDate: resolvedEndDate,
    endTime: resolvedEndTime,
    timezone,
    allDay: false,
  };
}

function eventDetails(event = {}, detailsUrl = '') {
  return [
    stripHtml(event.short_description || event.description).slice(0, 800),
    detailsUrl ? `More details: ${detailsUrl}` : '',
  ].filter(Boolean).join('\n\n');
}

function eventTitle(event = {}) {
  return String(event.title || 'Event').trim() || 'Event';
}

function eventLocation(event = {}) {
  return eventMapLabel(event) || String(event.location || event.venue || '').trim();
}

function eventGeoLine(event = {}) {
  const coords = parseEventCoords(event);
  if (!coords) return '';
  return `GEO:${coords.lat};${coords.lng}`;
}

/**
 * Google Calendar template URL using the event's local wall-clock time and timezone.
 * Returns '' when the event has no usable start date.
 */
export function buildGoogleCalendarUrl(event = {}, { detailsUrl = '' } = {}) {
  const schedule = resolveCalendarSchedule(event);
  if (!schedule) return '';

  const dates = schedule.allDay
    ? `${compactDate(schedule.startDate)}/${compactDate(schedule.endDate)}`
    : `${compactDateTime(schedule.startDate, schedule.startTime)}/${compactDateTime(schedule.endDate, schedule.endTime)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(event),
    dates,
    ctz: schedule.timezone,
    location: eventLocation(event),
    details: eventDetails(event, detailsUrl),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookIso(datePart, timePart, allDay) {
  if (allDay) return datePart;
  return `${datePart}T${timePart}`;
}

export function buildOutlookCalendarUrl(event = {}, { detailsUrl = '', office = false } = {}) {
  const schedule = resolveCalendarSchedule(event);
  if (!schedule) return '';

  const params = new URLSearchParams({
    rru: 'addevent',
    subject: eventTitle(event),
    startdt: outlookIso(schedule.startDate, schedule.startTime, schedule.allDay),
    enddt: outlookIso(schedule.endDate, schedule.endTime, schedule.allDay),
    body: eventDetails(event, detailsUrl),
    location: eventLocation(event),
  });
  const host = office ? 'outlook.office.com' : 'outlook.live.com';
  const path = office
    ? '/calendar/0/deeplink/compose'
    : '/calendar/0/action/compose';
  return `https://${host}${path}?${params.toString()}`;
}

export function buildYahooCalendarUrl(event = {}, { detailsUrl = '' } = {}) {
  const schedule = resolveCalendarSchedule(event);
  if (!schedule) return '';

  const params = new URLSearchParams({
    v: '60',
    title: eventTitle(event),
    st: schedule.allDay ? compactDate(schedule.startDate) : compactDateTime(schedule.startDate, schedule.startTime),
    et: schedule.allDay ? compactDate(schedule.endDate) : compactDateTime(schedule.endDate, schedule.endTime),
    desc: eventDetails(event, detailsUrl),
    in_loc: eventLocation(event),
  });
  return `https://calendar.yahoo.com/?${params.toString()}`;
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  let remaining = line.slice(75);
  while (remaining.length) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join('\r\n');
}

export function buildIcsFilename(event = {}) {
  const slug = String(event.slug || event.title || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}

export function buildIcsContent(event = {}, { detailsUrl = '', uid = '' } = {}) {
  const schedule = resolveCalendarSchedule(event);
  if (!schedule) return '';

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const eventUid = String(uid || event.id || event.slug || `evt-${compactDate(schedule.startDate)}`).trim()
    || `evt-${compactDate(schedule.startDate)}`;
  const startValue = schedule.allDay
    ? compactDate(schedule.startDate)
    : compactDateTime(schedule.startDate, schedule.startTime);
  const endValue = schedule.allDay
    ? compactDate(schedule.endDate)
    : compactDateTime(schedule.endDate, schedule.endTime);
  const startLine = schedule.allDay
    ? `DTSTART;VALUE=DATE:${startValue}`
    : `DTSTART;TZID=${schedule.timezone}:${startValue}`;
  const endLine = schedule.allDay
    ? `DTEND;VALUE=DATE:${endValue}`
    : `DTEND;TZID=${schedule.timezone}:${endValue}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mutale Mubanga//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(`${eventUid}@mutalemubanga.org`)}`,
    `DTSTAMP:${stamp}`,
    startLine,
    endLine,
    `SUMMARY:${escapeIcsText(eventTitle(event))}`,
    `DESCRIPTION:${escapeIcsText(eventDetails(event, detailsUrl))}`,
    `LOCATION:${escapeIcsText(eventLocation(event))}`,
    eventGeoLine(event),
    detailsUrl ? `URL:${detailsUrl}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function buildCalendarChooserUrl(appOrigin = '', slug = '') {
  const origin = String(appOrigin || '').replace(/\/$/, '');
  const cleanSlug = String(slug || '').trim();
  if (!origin || !cleanSlug) return '';
  return `${origin}/events/${encodeURIComponent(cleanSlug)}/calendar`;
}

export function buildCalendarOptions(event = {}, { detailsUrl = '' } = {}) {
  const google = buildGoogleCalendarUrl(event, { detailsUrl });
  if (!google) return [];
  return [
    { id: 'google', label: 'Google Calendar', href: google },
    { id: 'outlook', label: 'Outlook.com', href: buildOutlookCalendarUrl(event, { detailsUrl }) },
    { id: 'office365', label: 'Outlook 365', href: buildOutlookCalendarUrl(event, { detailsUrl, office: true }) },
    { id: 'yahoo', label: 'Yahoo Calendar', href: buildYahooCalendarUrl(event, { detailsUrl }) },
    { id: 'ics', label: 'Apple Calendar and others', href: '', download: true },
  ];
}

/** @deprecated Use buildGoogleCalendarUrl */
export function buildGoogleCalendarLink(event = {}, fallbackUrl = '') {
  return buildGoogleCalendarUrl(event, { detailsUrl: fallbackUrl }) || fallbackUrl;
}
