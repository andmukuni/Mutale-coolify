import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from './googleCalendar.js';

describe('buildGoogleCalendarUrl', () => {
  it('builds a Google Calendar template link in Africa/Lusaka local time', () => {
    const url = buildGoogleCalendarUrl({
      title: 'Interview Masterclass',
      start_date: '2026-08-15',
      start_time: '09:00:00',
      end_date: '2026-08-15',
      end_time: '11:00:00',
      timezone: 'Africa/Lusaka',
      location: 'Online',
    }, { detailsUrl: 'https://mutalemubanga.org/events/interview-masterclass' });

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
