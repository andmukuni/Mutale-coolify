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
} from './speakingEngagements.js';

const SPEAKER = 'Mutale Mubanga';

export function canAddToCalendar(engagement) {
  if (!engagement || engagement.dates_tbc || !engagement.start_date) return false;
  if (engagement.participation_status !== 'confirmed') return false;
  if ((engagement.event_status || 'scheduled') !== 'scheduled') return false;
  return engagement.section === 'upcoming';
}

const compactDate = (date) => String(date).slice(0, 10).replace(/-/g, '');
const compactTime = (time) => `${String(time).slice(0, 5).replace(':', '')}00`;

/** All-day DTEND is exclusive, so a one-day event ends the following day. */
function dayAfter(date) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Mutale's session when its date and start time are known; otherwise the event's days. */
export function speakingCalendarSchedule(engagement) {
  if (engagement.session_date && engagement.session_start_time) {
    return {
      allDay: false,
      timezone: engagement.timezone || DEFAULT_SPEAKING_TIMEZONE,
      date: engagement.session_date,
      start: engagement.session_start_time,
      end: engagement.session_end_time || null,
    };
  }
  return { allDay: true, startDate: engagement.start_date, endDate: engagement.end_date || engagement.start_date };
}

export function speakingCalendarTitle(engagement) {
  const schedule = speakingCalendarSchedule(engagement);
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
    schedule.allDay
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
  if (!canAddToCalendar(engagement)) return '';
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
      `DTSTART;TZID=${schedule.timezone}:${compactDate(schedule.date)}T${compactTime(schedule.start)}`,
      // No end time is invented: without one the entry marks the start only.
      schedule.end ? `DTEND;TZID=${schedule.timezone}:${compactDate(schedule.date)}T${compactTime(schedule.end)}` : '',
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
