import { describe, expect, it } from 'vitest';
import {
  buildSpeakingIcs,
  canAddToCalendar,
  speakingCalendarFilename,
  speakingCalendarTitle,
} from '../speakingCalendar.js';

const NOW = new Date('2026-11-02T10:00:00Z');

const BASE = {
  id: 'spk-1',
  event_title: 'Annual Scientific Conference',
  roles: ['keynote_speaker', 'panellist'],
  session_title: null,
  start_date: '2026-12-02',
  end_date: '2026-12-03',
  dates_tbc: false,
  session_date: null,
  session_start_time: null,
  session_end_time: null,
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  venue: 'Mulungushi Centre',
  city: 'Lusaka',
  country: 'Zambia',
  event_url: 'https://example.org/conference',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
};

const unfold = (ics) => ics.replace(/\r\n /g, '');
const line = (ics, name) => unfold(ics).split('\r\n').find((l) => l.startsWith(name));

describe('canAddToCalendar', () => {
  it('offers only confirmed, scheduled, upcoming engagements with known dates', () => {
    expect(canAddToCalendar(BASE)).toBe(true);
    expect(canAddToCalendar({ ...BASE, participation_status: 'invited' })).toBe(false);
    expect(canAddToCalendar({ ...BASE, event_status: 'postponed' })).toBe(false);
    expect(canAddToCalendar({ ...BASE, event_status: 'cancelled' })).toBe(false);
    expect(canAddToCalendar({ ...BASE, dates_tbc: true })).toBe(false);
    expect(canAddToCalendar({ ...BASE, start_date: null })).toBe(false);
    expect(canAddToCalendar({ ...BASE, section: 'previous' })).toBe(false);
    expect(buildSpeakingIcs({ ...BASE, participation_status: 'invited' }, { now: NOW })).toBe('');
  });
});

describe('buildSpeakingIcs', () => {
  it('uses the event days as an all-day entry when the session time is unknown', () => {
    const ics = buildSpeakingIcs(BASE, { now: NOW, pageUrl: 'https://mutalemubanga.org/speaking' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(line(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261202');
    // DTEND is exclusive for all-day entries.
    expect(line(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20261204');
    expect(line(ics, 'TRANSP')).toBe('TRANSP:TRANSPARENT');
    expect(line(ics, 'SUMMARY')).toBe('SUMMARY:Mutale Mubanga at Annual Scientific Conference');
    expect(line(ics, 'UID')).toBe('UID:speaking-spk-1@mutalemubanga.org');
    expect(line(ics, 'LOCATION')).toBe('LOCATION:Mulungushi Centre\\, Lusaka\\, Zambia');
    expect(line(ics, 'URL')).toBe('URL:https://example.org/conference');
    expect(line(ics, 'DTSTAMP')).toBe('DTSTAMP:20261102T100000Z');
  });

  it('distinguishes Mutale’s session from the wider event and never implies registration', () => {
    const ics = unfold(buildSpeakingIcs({
      ...BASE,
      session_title: 'Quality systems that last',
      session_date: '2026-12-03',
      session_start_time: '09:30:00',
      session_end_time: '10:15:00',
    }, { now: NOW }));
    expect(line(ics, 'DTSTART')).toBe('DTSTART;TZID=Africa/Lusaka:20261203T093000');
    expect(line(ics, 'DTEND')).toBe('DTEND;TZID=Africa/Lusaka:20261203T101500');
    expect(line(ics, 'SUMMARY')).toBe('SUMMARY:Mutale Mubanga: Quality systems that last (Annual Scientific Conference)');
    const description = line(ics, 'DESCRIPTION');
    expect(description).toContain('Mutale Mubanga\'s role: Keynote speaker · Panellist.');
    expect(description).toContain('session within Annual Scientific Conference');
    expect(description).toContain('Saving this date does not register you for the event.');
    expect(ics).not.toMatch(/TRANSP:/);
  });

  it('does not invent a session end time or a single-day end date', () => {
    const timed = buildSpeakingIcs({ ...BASE, session_date: '2026-12-02', session_start_time: '14:00' }, { now: NOW });
    expect(line(timed, 'DTSTART')).toBe('DTSTART;TZID=Africa/Lusaka:20261202T140000');
    expect(line(timed, 'DTEND')).toBeUndefined();
    expect(line(timed, 'SUMMARY')).toBe('SUMMARY:Mutale Mubanga speaking at Annual Scientific Conference');

    const oneDay = buildSpeakingIcs({ ...BASE, end_date: null, start_date: '2026-12-31' }, { now: NOW });
    expect(line(oneDay, 'DTEND')).toBe('DTEND;VALUE=DATE:20270101');
  });

  it('escapes text, folds long lines, and leaves out what is not known', () => {
    const ics = buildSpeakingIcs({
      ...BASE,
      event_title: 'Leadership; Systems, and Growth — a very long conference title that keeps going well past seventy-five characters',
      venue: null,
      city: null,
      country: null,
      attendance_format: null,
      event_url: null,
    }, { now: NOW });
    for (const raw of ics.split('\r\n')) expect(raw.length).toBeLessThanOrEqual(75);
    expect(line(ics, 'SUMMARY')).toContain('Leadership\\; Systems\\, and Growth');
    expect(line(ics, 'LOCATION')).toBeUndefined();
    expect(line(ics, 'URL')).toBeUndefined();
    expect(line(ics, 'DESCRIPTION')).toContain('contact the organiser');
  });
});

describe('calendar labels', () => {
  it('names the file and entry after the event', () => {
    expect(speakingCalendarFilename(BASE)).toBe('mutale-mubanga-annual-scientific-conference.ics');
    expect(speakingCalendarTitle(BASE)).toBe('Mutale Mubanga at Annual Scientific Conference');
  });
});
