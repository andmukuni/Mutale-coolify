/**
 * "Add to calendar" for public speaking engagements (brief §9). Only confirmed,
 * scheduled, upcoming engagements with known dates qualify. The entry describes
 * Mutale's part in the event, and says plainly that saving it registers no one.
 */
import { escapeIcsText, foldIcsLine } from './googleCalendar.js';
import {
  DEFAULT_SPEAKING_TIMEZONE,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  isValidTimeZone,
  todayInTimeZone,
} from './speakingEngagements.js';

const SPEAKER = 'Mutale Mubanga';

const zoneOf = (engagement) => (isValidTimeZone(engagement.timezone) ? engagement.timezone : DEFAULT_SPEAKING_TIMEZONE);

/** Once Mutale's session day has passed there is nothing left to save, even while the event runs on. */
export function canAddToCalendar(engagement, now = new Date()) {
  if (!engagement || engagement.dates_tbc || !engagement.start_date) return false;
  if (engagement.participation_status !== 'confirmed') return false;
  if ((engagement.event_status || 'scheduled') !== 'scheduled') return false;
  if (engagement.section !== 'upcoming') return false;
  return !engagement.session_date || engagement.session_date >= todayInTimeZone(zoneOf(engagement), now);
}

const compactDate = (date) => String(date).slice(0, 10).replace(/-/g, '');

/** All-day DTEND is exclusive, so a one-day event ends the following day. */
function dayAfter(date) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Milliseconds the zone is ahead of UTC at a given instant. */
function zoneOffsetMs(zone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs;
}

/**
 * A wall-clock time in the event's zone as a UTC timestamp (YYYYMMDDTHHMMSSZ).
 * Written in UTC because a TZID without a VTIMEZONE block is read differently
 * by some calendars (Outlook for Windows among them).
 */
function utcStamp(date, time, zone) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - zoneOffsetMs(zone, wall);
  // Near a daylight-saving change the first guess can be an hour out.
  const corrected = wall - zoneOffsetMs(zone, utc);
  if (corrected !== utc) utc = corrected;
  return new Date(utc).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Mutale's session when its time is known, the session day when only the day
 * is, and otherwise the event's days.
 */
export function speakingCalendarSchedule(engagement) {
  if (engagement.session_date && engagement.session_start_time) {
    return {
      allDay: false,
      timezone: zoneOf(engagement),
      date: engagement.session_date,
      start: engagement.session_start_time,
      end: engagement.session_end_time || null,
    };
  }
  if (engagement.session_date) {
    return { allDay: true, sessionDay: true, startDate: engagement.session_date, endDate: engagement.session_date };
  }
  return { allDay: true, startDate: engagement.start_date, endDate: engagement.end_date || engagement.start_date };
}

export function speakingCalendarTitle(engagement) {
  const schedule = speakingCalendarSchedule(engagement);
  if (schedule.sessionDay) return `${SPEAKER} speaking at ${engagement.event_title}`;
  if (schedule.allDay) return `${SPEAKER} at ${engagement.event_title}`;
  return engagement.session_title
    ? `${SPEAKER}: ${engagement.session_title} (${engagement.event_title})`
    : `${SPEAKER} speaking at ${engagement.event_title}`;
}

export function speakingCalendarDescription(engagement, { pageUrl = '' } = {}) {
  const schedule = speakingCalendarSchedule(engagement);
  const roles = formatRoles(engagement.roles);
  const dates = formatEngagementDateRange(engagement);
  return [
    roles ? `${SPEAKER}'s role: ${roles}.` : '',
    schedule.sessionDay
      ? `This is the day of ${SPEAKER}'s session within ${engagement.event_title} (${dates}). The time has not been announced.`
      : schedule.allDay
        ? `These are the dates of ${engagement.event_title} (${dates}). The time of ${SPEAKER}'s session has not been announced.`
        : `This is ${SPEAKER}'s session within ${engagement.event_title} (${dates}).`,
    'Saving this date does not register you for the event.',
    engagement.event_url
      ? `For event details or to attend, see the event website: ${engagement.event_url}`
      : 'For event details or to attend, contact the organiser.',
    pageUrl ? `More speaking engagements: ${pageUrl}` : '',
  ].filter(Boolean).join('\n');
}

export function speakingCalendarFilename(engagement) {
  const slug = String(engagement.event_title || 'engagement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `mutale-mubanga-${slug || 'engagement'}.ics`;
}

/** iCalendar text for one engagement, or '' when it doesn't qualify. */
export function buildSpeakingIcs(engagement, { pageUrl = '', now = new Date() } = {}) {
  if (!canAddToCalendar(engagement, now)) return '';
  const schedule = speakingCalendarSchedule(engagement);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const timing = schedule.allDay
    ? [
      `DTSTART;VALUE=DATE:${compactDate(schedule.startDate)}`,
      `DTEND;VALUE=DATE:${dayAfter(schedule.endDate)}`,
      // The event's days shouldn't mark the visitor as busy.
      'TRANSP:TRANSPARENT',
    ]
    : [
      `DTSTART:${utcStamp(schedule.date, schedule.start, schedule.timezone)}`,
      // No end time is invented: without one the entry marks the start only.
      schedule.end ? `DTEND:${utcStamp(schedule.date, schedule.end, schedule.timezone)}` : '',
    ];
  const location = formatEngagementLocation(engagement);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mutale Mubanga//Speaking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(`speaking-${engagement.id}@mutalemubanga.org`)}`,
    `DTSTAMP:${stamp}`,
    ...timing,
    `SUMMARY:${escapeIcsText(speakingCalendarTitle(engagement))}`,
    `DESCRIPTION:${escapeIcsText(speakingCalendarDescription(engagement, { pageUrl }))}`,
    location ? `LOCATION:${escapeIcsText(location)}` : '',
    engagement.event_url ? `URL:${engagement.event_url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
