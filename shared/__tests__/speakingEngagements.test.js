import { describe, expect, it } from 'vitest';
import {
  classifyEngagement,
  formatEngagementDateRange,
  formatEngagementDateTile,
  formatEngagementLocation,
  formatRoles,
  formatSessionTime,
  groupEngagements,
  mediaActionLabel,
  isPubliclyVisible,
  normalizeEngagementInput,
  todayInTimeZone,
  toPublicEngagement,
} from '../speakingEngagements.js';

// 23:30 UTC on 10 Nov 2026: already 11 Nov in Lusaka (UTC+2), still 10 Nov in Honolulu (UTC-10).
const NOW = new Date('2026-11-10T23:30:00Z');

describe('normalizeEngagementInput', () => {
  it('saves with only a title and applies safe defaults', () => {
    const { value, errors } = normalizeEngagementInput({ event_title: '  Youth Leadership Summit ' });
    expect(errors).toEqual({});
    expect(value).toMatchObject({
      event_title: 'Youth Leadership Summit',
      start_date: null,
      timezone: 'Africa/Lusaka',
      audience_access: 'unspecified',
      participation_status: 'invited',
      event_status: 'scheduled',
      dates_tbc: 0,
      featured: 0,
    });
    expect(value).not.toHaveProperty('publication_state');
  });

  it('requires a title', () => {
    expect(normalizeEngagementInput({}).errors.event_title).toBeTruthy();
  });

  it('accepts only http and https event URLs', () => {
    expect(normalizeEngagementInput({ event_title: 'A', event_url: 'https://example.org/forum' }).value.event_url)
      .toBe('https://example.org/forum');
    expect(normalizeEngagementInput({ event_title: 'A', event_url: 'http://example.org' }).errors).toEqual({});
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org', 'example.org', '/events/x']) {
      const { value, errors } = normalizeEngagementInput({ event_title: 'A', event_url: bad });
      expect(errors.event_url, bad).toBeTruthy();
      expect(value.event_url).toBeNull();
    }
  });

  it('treats an empty URL as no URL', () => {
    const { value, errors } = normalizeEngagementInput({ event_title: 'A', event_url: '   ' });
    expect(errors).toEqual({});
    expect(value.event_url).toBeNull();
  });

  it('keeps several roles on one engagement, de-duplicated, and rejects unknown roles', () => {
    const ok = normalizeEngagementInput({ event_title: 'A', roles: ['speaker', 'panellist', 'speaker'] });
    expect(JSON.parse(ok.value.roles_json)).toEqual(['speaker', 'panellist']);
    expect(normalizeEngagementInput({ event_title: 'A', roles: ['host'] }).errors.roles).toBeTruthy();
  });

  it('validates date ranges and real calendar dates', () => {
    expect(normalizeEngagementInput({ event_title: 'A', start_date: '2026-12-03', end_date: '2026-12-02' }).errors.end_date)
      .toBeTruthy();
    expect(normalizeEngagementInput({ event_title: 'A', start_date: '2026-02-30' }).errors.start_date).toBeTruthy();
    expect(normalizeEngagementInput({ event_title: 'A', end_date: '2026-12-02' }).errors.start_date).toBeTruthy();
    expect(normalizeEngagementInput({ event_title: 'A', dates_tbc: true }).errors).toEqual({});
  });

  it('keeps session times separate and does not invent them', () => {
    const { value } = normalizeEngagementInput({ event_title: 'A', start_date: '2026-12-01' });
    expect(value.session_date).toBeNull();
    expect(value.session_start_time).toBeNull();

    const timed = normalizeEngagementInput({
      event_title: 'A', start_date: '2026-12-01', session_date: '2026-12-01', session_start_time: '9:30', session_end_time: '10:15',
    });
    expect(timed.errors).toEqual({});
    expect(timed.value.session_start_time).toBe('09:30:00');
    expect(normalizeEngagementInput({ event_title: 'A', session_start_time: '09:30' }).errors.session_date).toBeTruthy();
  });

  it('ties a session date to the event dates, so the card lands in the right section', () => {
    const save = (input) => normalizeEngagementInput({ event_title: 'A', ...input });
    expect(save({ session_date: '2026-11-07' }).errors.start_date)
      .toBe('Add the event start date. For a one-day event, use the session date.');
    // Dates still to be confirmed may be incomplete.
    expect(save({ session_date: '2026-11-07', dates_tbc: true }).errors).toEqual({});

    const range = { start_date: '2026-11-06', end_date: '2026-11-11' };
    expect(save({ ...range, session_date: '2026-11-06' }).errors).toEqual({});
    expect(save({ ...range, session_date: '2026-11-11' }).errors).toEqual({});
    for (const outside of ['2026-11-05', '2026-11-12']) {
      expect(save({ ...range, session_date: outside }).errors.session_date, outside)
        .toBe('The session date must fall between the event start and end dates.');
    }
    expect(save({ start_date: '2026-11-06', session_date: '2026-11-06' }).errors).toEqual({});
    expect(save({ start_date: '2026-11-06', session_date: '2026-11-07' }).errors.session_date).toMatch(/must match the event date/);
    // A bad end date is reported on its own field, not as a session problem.
    expect(save({ ...range, end_date: '2026-11-01', session_date: '2026-11-07' }).errors)
      .toEqual({ end_date: 'End date must be on or after the start date.' });
  });

  it('rejects unknown time zones and enum values', () => {
    const { errors } = normalizeEngagementInput({
      event_title: 'A', timezone: 'Mars/Olympus', participation_status: 'maybe', event_status: 'moved',
    });
    expect(errors.timezone).toBeTruthy();
    expect(errors.participation_status).toBeTruthy();
    expect(errors.event_status).toBeTruthy();
  });

  it('requires alt text with an image and accepts uploaded paths', () => {
    expect(normalizeEngagementInput({ event_title: 'A', image_url: '/uploads/site/logo.png' }).errors.image_alt).toBeTruthy();
    const { value, errors } = normalizeEngagementInput({
      event_title: 'A', image_url: '/uploads/site/logo.png', image_alt: 'BMSZ logo',
    });
    expect(errors).toEqual({});
    expect(value.image_url).toBe('/uploads/site/logo.png');
    expect(normalizeEngagementInput({ event_title: 'A', image_url: '/uploads/../.env', image_alt: 'x' }).errors.image_url)
      .toBeTruthy();
  });

  it('rejects an image address longer than the column holds, instead of failing to save', () => {
    const { errors } = normalizeEngagementInput({
      event_title: 'A', image_url: `https://cdn.example.org/${'a'.repeat(1100)}.png`, image_alt: 'Logo',
    });
    expect(errors.image_url).toBe('This web address is too long.');
  });
});

describe('isPubliclyVisible', () => {
  it('shows only published, non-declined records', () => {
    expect(isPubliclyVisible({ publication_state: 'published', participation_status: 'confirmed' })).toBe(true);
    expect(isPubliclyVisible({ publication_state: 'published', participation_status: 'invited' })).toBe(true);
    expect(isPubliclyVisible({ publication_state: 'published', participation_status: 'declined' })).toBe(false);
    expect(isPubliclyVisible({ publication_state: 'draft', participation_status: 'confirmed' })).toBe(false);
    expect(isPubliclyVisible({ publication_state: 'hidden', participation_status: 'confirmed' })).toBe(false);
  });
});

describe('classifyEngagement', () => {
  it('reads "today" in the event time zone', () => {
    expect(todayInTimeZone('Africa/Lusaka', NOW)).toBe('2026-11-11');
    expect(todayInTimeZone('Pacific/Honolulu', NOW)).toBe('2026-11-10');
  });

  it('uses the end date of a range and the event time zone', () => {
    const range = { start_date: '2026-11-06', end_date: '2026-11-10' };
    expect(classifyEngagement({ ...range, timezone: 'Africa/Lusaka' }, NOW)).toEqual({ section: 'previous', inProgress: false });
    expect(classifyEngagement({ ...range, timezone: 'Pacific/Honolulu' }, NOW)).toEqual({ section: 'upcoming', inProgress: true });
  });

  it('uses the start date for single-day events', () => {
    expect(classifyEngagement({ start_date: '2026-11-11', timezone: 'Africa/Lusaka' }, NOW))
      .toEqual({ section: 'upcoming', inProgress: true });
    expect(classifyEngagement({ start_date: '2026-11-10', timezone: 'Africa/Lusaka' }, NOW).section).toBe('previous');
    expect(classifyEngagement({ start_date: '2026-12-01', timezone: 'Africa/Lusaka' }, NOW))
      .toEqual({ section: 'upcoming', inProgress: false });
  });

  it('puts undated and TBC engagements under "to be announced"', () => {
    expect(classifyEngagement({ start_date: null }, NOW).section).toBe('tba');
    expect(classifyEngagement({ start_date: '2026-12-01', dates_tbc: 1 }, NOW).section).toBe('tba');
  });

  it('never marks a cancelled or postponed engagement as in progress', () => {
    const live = { start_date: '2026-11-11', timezone: 'Africa/Lusaka' };
    expect(classifyEngagement({ ...live, event_status: 'cancelled' }, NOW)).toEqual({ section: 'upcoming', inProgress: false });
    expect(classifyEngagement({ ...live, event_status: 'postponed' }, NOW).inProgress).toBe(false);
  });
});

describe('groupEngagements', () => {
  it('orders upcoming nearest first with in-progress on top, and previous most recent first', () => {
    const rows = [
      { id: 'later', start_date: '2027-01-15', timezone: 'Africa/Lusaka' },
      { id: 'soon', start_date: '2026-12-01', timezone: 'Africa/Lusaka' },
      { id: 'now', start_date: '2026-11-09', end_date: '2026-11-12', timezone: 'Africa/Lusaka' },
      { id: 'old', start_date: '2025-03-01', timezone: 'Africa/Lusaka' },
      { id: 'recent', start_date: '2026-10-01', end_date: '2026-10-03', timezone: 'Africa/Lusaka' },
      { id: 'tbc', start_date: null },
    ];
    const groups = groupEngagements(rows, NOW);
    expect(groups.upcoming.map((g) => g.row.id)).toEqual(['now', 'soon', 'later']);
    expect(groups.upcoming[0].inProgress).toBe(true);
    expect(groups.previous.map((g) => g.row.id)).toEqual(['recent', 'old']);
    expect(groups.tba.map((g) => g.row.id)).toEqual(['tbc']);
  });

  it('orders previous engagements by the day they ended, not the day they began', () => {
    const groups = groupEngagements([
      { id: 'single', start_date: '2026-10-05', timezone: 'Africa/Lusaka' },
      { id: 'long', start_date: '2026-09-01', end_date: '2026-10-20', timezone: 'Africa/Lusaka' },
    ], NOW);
    expect(groups.previous.map((g) => g.row.id)).toEqual(['long', 'single']);
  });
});

describe('toPublicEngagement', () => {
  const row = {
    id: 'spk-1',
    event_title: 'BMSZ2026 Scientific Conference',
    organiser: 'BMSZ',
    roles_json: '["speaker","facilitator"]',
    start_date: '2026-12-02',
    end_date: '2026-12-03',
    dates_tbc: 0,
    timezone: 'Africa/Lusaka',
    event_url: 'https://example.org/bmsz',
    image_url: null,
    participation_status: 'confirmed',
    event_status: 'scheduled',
    publication_state: 'published',
    featured: 0,
    admin_notes: 'Contact: Dr X, +260 97…',
    created_by: 'usr-1',
    updated_by: 'usr-1',
    published_at: '2026-11-01 10:00:00',
  };

  it('exposes a whitelist only — never private notes or audit fields', () => {
    const pub = toPublicEngagement(row);
    for (const key of ['admin_notes', 'created_by', 'updated_by', 'published_at', 'publication_state', 'roles_json']) {
      expect(pub, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(pub)).not.toContain('Dr X');
    expect(pub.roles).toEqual(['speaker', 'facilitator']);
  });

  it('drops an unsafe stored URL rather than returning it', () => {
    expect(toPublicEngagement({ ...row, event_url: 'javascript:alert(1)' }).event_url).toBeNull();
  });

  it('hides tentative dates when marked to be confirmed', () => {
    const pub = toPublicEngagement({ ...row, dates_tbc: 1 });
    expect(pub.dates_tbc).toBe(true);
    expect(pub.start_date).toBeNull();
    expect(pub.end_date).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats single days, ranges within a month, across months, and across years', () => {
    expect(formatEngagementDateTile({ start_date: '2027-01-15' })).toEqual({ primary: '15', secondary: 'Jan 2027' });
    expect(formatEngagementDateTile({ start_date: '2026-11-06', end_date: '2026-11-11' }))
      .toEqual({ primary: '06–11', secondary: 'Nov 2026' });
    expect(formatEngagementDateTile({ start_date: '2026-11-28', end_date: '2026-12-02' }))
      .toEqual({ primary: '28 Nov – 02 Dec', secondary: '2026' });
    expect(formatEngagementDateTile({ start_date: '2026-12-30', end_date: '2027-01-02' }))
      .toEqual({ primary: '30 Dec – 02 Jan', secondary: '2026–27' });
    expect(formatEngagementDateTile({ start_date: '2026-12-01', dates_tbc: true })).toBeNull();

    expect(formatEngagementDateRange({ start_date: '2026-11-06', end_date: '2026-11-11' })).toBe('6–11 November 2026');
    expect(formatEngagementDateRange({ start_date: '2026-12-30', end_date: '2027-01-02' }))
      .toBe('30 December 2026 – 2 January 2027');
    expect(formatEngagementDateRange({ start_date: null })).toBe('Dates to be announced');
  });

  it('shows session times only when entered, with the event time zone', () => {
    expect(formatSessionTime({ session_date: '2026-12-02' })).toBe('2 Dec 2026');
    expect(formatSessionTime({
      session_date: '2026-12-02', session_start_time: '09:30:00', session_end_time: '10:15:00', timezone: 'Africa/Lusaka',
    })).toMatch(/^2 Dec 2026, 09:30–10:15 \((CAT|GMT\+2)\)$/);
    expect(formatSessionTime({ session_date: null })).toBeNull();
  });

  it('describes location and format', () => {
    expect(formatEngagementLocation({ city: 'Livingstone', country: 'Zambia' })).toBe('Livingstone, Zambia');
    expect(formatEngagementLocation({ attendance_format: 'online' })).toBe('Online');
    expect(formatEngagementLocation({ attendance_format: 'hybrid', city: 'Lusaka' })).toBe('Lusaka · Hybrid');
    expect(formatEngagementLocation({})).toBeNull();
    expect(formatRoles(['keynote_speaker', 'moderator'])).toBe('Keynote speaker · Moderator');
  });
});

describe('topics and media links', () => {
  const save = (input) => normalizeEngagementInput({ event_title: 'Talk', ...input });

  it('accepts topics as text or a list, dropping duplicates regardless of case', () => {
    expect(JSON.parse(save({ topics: ' Leadership ,leadership, Quality  systems,' }).value.topics_json))
      .toEqual(['Leadership', 'Quality systems']);
    expect(JSON.parse(save({ topics: ['Growth', 'growth'] }).value.topics_json)).toEqual(['Growth']);
    expect(save({ topics: Array.from({ length: 9 }, (_, i) => `Topic ${i}`) }).errors.topics).toMatch(/up to 8/);
    expect(save({ topics: ['x'.repeat(61)] }).errors.topics).toMatch(/60 characters/);
  });

  it('keeps safe media links, ignores empty rows and explains the first problem', () => {
    const { value, errors } = save({
      media: [
        { type: 'recording', url: 'https://video.example.org/x', label: ' ' },
        { type: '', url: '', label: '' },
        { type: 'article', url: 'https://news.example.org/a', label: 'Read the interview' },
      ],
    });
    expect(errors).toEqual({});
    expect(JSON.parse(value.media_json)).toEqual([
      { type: 'recording', url: 'https://video.example.org/x', label: null },
      { type: 'article', url: 'https://news.example.org/a', label: 'Read the interview' },
    ]);
    expect(save({ media: [{ type: 'podcast', url: 'https://x.example' }] }).errors.media).toBe('Link 1: choose what it is.');
    expect(save({ media: [{ type: 'slides', url: 'javascript:alert(1)' }] }).errors.media).toMatch(/^Link 1: use a full web address/);
    expect(save({ media: Array.from({ length: 7 }, () => ({ type: 'photos', url: 'https://x.example' })) }).errors.media)
      .toMatch(/up to 6/);
  });

  it('labels media actions plainly unless the admin wrote a label', () => {
    expect(mediaActionLabel({ type: 'recording' })).toBe('Watch recording');
    expect(mediaActionLabel({ type: 'slides', label: 'Download the slides' })).toBe('Download the slides');
  });

  it('never shows unsafe stored links publicly', () => {
    const pub = toPublicEngagement({
      id: 'x', event_title: 'T', participation_status: 'confirmed', publication_state: 'published',
      topics_json: '["Leadership"]',
      media_json: JSON.stringify([{ type: 'slides', url: 'javascript:alert(1)' }, { type: 'photos', url: 'https://p.example' }]),
    });
    expect(pub.topics).toEqual(['Leadership']);
    expect(pub.media).toEqual([{ type: 'photos', url: 'https://p.example/', label: null }]);
  });
});

describe('past cancellations', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  it('get their own section, while upcoming cancellations stay in Upcoming', () => {
    expect(classifyEngagement({ start_date: '2026-10-01', event_status: 'cancelled' }, now).section).toBe('cancelled');
    expect(classifyEngagement({ start_date: '2026-12-01', event_status: 'cancelled' }, now).section).toBe('upcoming');
    expect(classifyEngagement({ start_date: '2026-10-01', event_status: 'postponed' }, now).section).toBe('previous');
  });

  it('are sorted most recent first', () => {
    const groups = groupEngagements([
      { event_title: 'Older', start_date: '2025-01-01', event_status: 'cancelled' },
      { event_title: 'Newer', start_date: '2026-01-01', event_status: 'cancelled' },
    ], now);
    expect(groups.cancelled.map((g) => g.row.event_title)).toEqual(['Newer', 'Older']);
    expect(groups.previous).toEqual([]);
  });
});

describe('topics and media edge cases', () => {
  const save = (input) => normalizeEngagementInput({ event_title: 'Talk', ...input });

  it('keeps typed topics that happen to start with "["', () => {
    expect(JSON.parse(save({ topics: '[Draft] Leadership, Systems' }).value.topics_json)).toEqual(['[Draft] Leadership', 'Systems']);
    expect(JSON.parse(save({ topics: '["Stored", "List"]' }).value.topics_json)).toEqual(['Stored', 'List']);
  });

  it('names the row the admin sees, counting empty rows, and marks its field', () => {
    const { errors } = save({ media: [{ type: 'recording', url: '', label: '' }, { type: 'slides', url: 'ftp://x' }] });
    expect(errors.media).toBe('Link 2: use a full web address starting with http:// or https://.');
    expect(errors.media_url_1).toBe('Use a full web address starting with http:// or https://.');
    // The row's own field comes first, so the form focuses it.
    expect(Object.keys(errors)[0]).toBe('media_url_1');
  });
});
