import { describe, expect, it } from 'vitest';
import {
  buildCalendarChooserUrl,
  buildCalendarOptions,
  buildGoogleCalendarUrl,
  buildIcsContent,
  buildOutlookCalendarUrl,
  buildYahooCalendarUrl,
} from './googleCalendar.js';

const event = {
  id: 'evt-1',
  slug: 'interview-masterclass',
  title: 'Interview Masterclass',
  start_date: '2026-08-15',
  start_time: '09:00:00',
  end_date: '2026-08-15',
  end_time: '11:00:00',
  timezone: 'Africa/Lusaka',
  location: 'Online',
};

describe('buildGoogleCalendarUrl', () => {
  it('builds a Google Calendar template link in Africa/Lusaka local time', () => {
    const url = buildGoogleCalendarUrl(event, {
      detailsUrl: 'https://mutalemubanga.org/events/interview-masterclass',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe('Interview Masterclass');
    expect(parsed.searchParams.get('dates')).toBe('20260815T090000/20260815T110000');
    expect(parsed.searchParams.get('ctz')).toBe('Africa/Lusaka');
    expect(parsed.searchParams.get('location')).toBe('Online');
    expect(parsed.searchParams.get('details')).toContain('https://mutalemubanga.org/events/interview-masterclass');
  });

  it('defaults a two-hour end when end time is missing', () => {
    const url = buildGoogleCalendarUrl({
      title: 'Workshop',
      start_date: '2026-08-15',
      start_time: '18:00',
      timezone: 'Africa/Lusaka',
    });
    expect(new URL(url).searchParams.get('dates')).toBe('20260815T180000/20260815T200000');
  });

  it('returns empty when the event has no start date', () => {
    expect(buildGoogleCalendarUrl({ title: 'Workshop' })).toBe('');
  });
});

describe('other calendar providers', () => {
  it('builds Outlook and Yahoo links from the same local times', () => {
    const outlook = new URL(buildOutlookCalendarUrl(event));
    expect(outlook.hostname).toBe('outlook.live.com');
    expect(outlook.searchParams.get('startdt')).toBe('2026-08-15T09:00:00');
    expect(outlook.searchParams.get('enddt')).toBe('2026-08-15T11:00:00');

    const office = new URL(buildOutlookCalendarUrl(event, { office: true }));
    expect(office.hostname).toBe('outlook.office.com');

    const yahoo = new URL(buildYahooCalendarUrl(event));
    expect(yahoo.hostname).toBe('calendar.yahoo.com');
    expect(yahoo.searchParams.get('st')).toBe('20260815T090000');
    expect(yahoo.searchParams.get('et')).toBe('20260815T110000');
  });

  it('builds an ICS file with the event timezone', () => {
    const ics = buildIcsContent(event, { detailsUrl: 'https://mutalemubanga.org/events/interview-masterclass' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;TZID=Africa/Lusaka:20260815T090000');
    expect(ics).toContain('DTEND;TZID=Africa/Lusaka:20260815T110000');
    expect(ics).toContain('SUMMARY:Interview Masterclass');
  });

  it('adds GEO and a richer LOCATION when the event has a map pin', () => {
    const ics = buildIcsContent({
      ...event,
      event_mode: 'in_person',
      venue: 'Mulungushi Conference Centre',
      location: 'Lusaka',
      location_place: 'Mulungushi International Conference Centre, Lusaka, Zambia',
      location_lat: -15.4167,
      location_lng: 28.2833,
    });
    expect(ics).toContain('GEO:-15.4167;28.2833');
    expect(ics).toContain('LOCATION:Mulungushi International Conference Centre\\, Lusaka\\, Zambia');
  });

  it('lists chooser options and a site calendar page URL', () => {
    const options = buildCalendarOptions(event);
    expect(options.map((item) => item.id)).toEqual(['google', 'outlook', 'office365', 'yahoo', 'ics']);
    expect(buildCalendarChooserUrl('https://mutalemubanga.org', 'interview-masterclass'))
      .toBe('https://mutalemubanga.org/events/interview-masterclass/calendar');
  });
});
