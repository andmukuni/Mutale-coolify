import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { defaultWebsitePages } from '../data/websitePages';

const mocks = vi.hoisted(() => ({ profile: {}, fetchEngagements: vi.fn() }));

vi.mock('../context/DataContext', () => ({ useData: () => ({ profile: mocks.profile }) }));
vi.mock('../utils/speakingApi', () => ({ fetchPublicSpeakingEngagements: mocks.fetchEngagements }));
vi.mock('../utils/speakingMetrics', () => ({ trackSpeaking: vi.fn() }));

import SpeakingPastPage from '../pages/SpeakingPastPage';

const card = (overrides) => ({
  id: 'spk-x',
  event_title: 'Engagement',
  roles: ['speaker'],
  timezone: 'Africa/Lusaka',
  audience_access: 'unspecified',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  dates_tbc: false,
  in_progress: false,
  ...overrides,
});

function renderPast() {
  mocks.profile = { websitePages: { ...defaultWebsitePages, sectionVisibility: {} } };
  return render(<MemoryRouter initialEntries={['/speaking/past']}><SpeakingPastPage /></MemoryRouter>);
}

const rowIn = (root, title, level) => within(root).getByRole('heading', { level, name: title }).closest('article');
const visible = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };

beforeEach(() => {
  mocks.fetchEngagements.mockReset();
  mocks.fetchEngagements.mockResolvedValue({ upcoming: [], previous: [], tba: [], cancelled: [] });
});

describe('SpeakingPastPage — page', () => {
  it('is headed “Where I’ve Spoken”, with a way back to the Speaking page', async () => {
    renderPast();
    expect(screen.getByRole('heading', { level: 1, name: 'Where I’ve Spoken' })).toBeInTheDocument();
    expect(screen.getByText('Previous Engagements')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Speaking' })).toHaveAttribute('href', '/speaking');
    expect(await screen.findByText('There are no past engagements to show yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Invite Me to Speak/ })).toHaveAttribute('href', '/speaking/invite');
  });

  it('leaves upcoming engagements to the Speaking page', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [card({ id: 'u1', event_title: 'Future Summit', start_date: '2099-01-10', section: 'upcoming' })],
      previous: [card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' })],
      tba: [], cancelled: [],
    });
    renderPast();
    expect(await screen.findByRole('heading', { name: 'Past Conference' })).toBeInTheDocument();
    expect(screen.queryByText('Future Summit')).not.toBeInTheDocument();
  });

  it('keeps focus on the heading while retrying, and on “Try again” if it fails again', async () => {
    mocks.fetchEngagements
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ upcoming: [], tba: [], previous: [card({ id: 'p1', event_title: 'Back Online', start_date: '2020-01-10', section: 'previous' })], cancelled: [] });
    renderPast();
    const heading = screen.getByRole('heading', { level: 1, name: 'Where I’ve Spoken' });

    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be loaded');
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Loading speaking engagements…');
    const again = await screen.findByRole('button', { name: /Try again/ });
    expect(again).toHaveFocus();

    fireEvent.click(again);
    expect(await screen.findByRole('heading', { name: 'Back Online' })).toBeInTheDocument();
    expect(heading).toHaveFocus();
  });
});

describe('SpeakingPastPage — past engagements', () => {
  it('lists them as compact rows under a heading for each year, most recent first, each opening its page', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], tba: [], cancelled: [],
      previous: [
        card({ id: 'p1', event_title: 'Accreditation Masterclass', event_type: 'workshop', roles: ['trainer'], start_date: '2026-09-28', end_date: '2026-10-02', city: 'Lusaka', country: 'Zambia', audience_access: 'public', section: 'previous' }),
        card({ id: 'p2', event_title: 'Quality Week Forum', start_date: '2026-06-10', section: 'previous', participation_status: 'invited' }),
        card({ id: 'p3', event_title: 'Lab Leaders Summit', start_date: '2025-11-14', section: 'previous' }),
      ],
    });
    renderPast();
    await screen.findByRole('heading', { name: 'Accreditation Masterclass' });
    // Years sit directly under the page heading; rows one level below.
    const years = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).filter((t) => /^\d{4}$/.test(t));
    expect(years).toEqual(['2026', '2025']);

    const row = rowIn(document.body, 'Accreditation Masterclass', 3);
    expect(within(row).getByText('28 Sep – 2 Oct')).toBeInTheDocument();
    expect(within(row).getByText('Workshop · Trainer · Lusaka, Zambia')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Accreditation Masterclass' })).toHaveAttribute('href', '/speaking/p1');
    // One link per row, and no "Open to the public" once the event is over.
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(within(row).queryByText('Open to the public')).not.toBeInTheDocument();
    // An unconfirmed invitation still says so, so it never reads as a talk given.
    expect(within(rowIn(document.body, 'Quality Week Forum', 3)).getByText('Invited')).toBeInTheDocument();
  });

  it('lists past cancellations under their own heading, apart from those that took place', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], tba: [],
      previous: [card({ id: 'p1', event_title: 'Took Place', start_date: '2020-05-01', section: 'previous' })],
      cancelled: [card({ id: 'c1', event_title: 'Called Off', start_date: '2020-06-01', section: 'cancelled', event_status: 'cancelled' })],
    });
    renderPast();
    const cancelled = await screen.findByRole('region', { name: 'Cancelled engagements' });
    expect(within(cancelled).getByRole('heading', { level: 3, name: '2020' })).toBeInTheDocument();
    const row = rowIn(cancelled, 'Called Off', 4);
    expect(within(row).getByText('Cancelled', visible)).toBeInTheDocument();
    expect(within(row).queryByText('Confirmed')).not.toBeInTheDocument();
    expect(within(cancelled).queryByText('Took Place')).not.toBeInTheDocument();
  });

  it('lists engagements with dates to be announced as rows, without a date', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], previous: [], cancelled: [],
      tba: [card({ id: 't1', event_title: 'Undated Forum', dates_tbc: true, event_type: 'forum', city: 'Ndola', country: 'Zambia', section: 'tba', audience_access: 'invitation_only' })],
    });
    renderPast();
    const tba = await screen.findByRole('region', { name: 'Dates to be announced' });
    const row = rowIn(tba, 'Undated Forum', 3);
    expect(within(row).getByText('Forum · Speaker · Ndola, Zambia')).toBeInTheDocument();
    expect(within(row).getByText('Invitation only')).toBeInTheDocument();
    expect(within(row).queryByText('Confirmed')).not.toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/speaking/t1');
    expect(row.querySelectorAll('p')).toHaveLength(1);
    expect(screen.queryByText('There are no past engagements to show yet.')).not.toBeInTheDocument();
  });
});

// Brief §10 item 7: the labels survive into every section.
describe('SpeakingPastPage — postponed and cancelled labels', () => {
  it('shows them on the rows in the past, cancelled and undated sections', async () => {
    const undated = { dates_tbc: true, start_date: null };
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [],
      tba: [
        card({ id: 't1', event_title: 'Moved Forum', ...undated, section: 'tba', event_status: 'postponed' }),
        card({ id: 't2', event_title: 'Dropped Forum', ...undated, section: 'tba', event_status: 'cancelled' }),
      ],
      previous: [card({ id: 'p1', event_title: 'Moved Seminar', start_date: '2020-05-01', section: 'previous', event_status: 'postponed' })],
      cancelled: [card({ id: 'c1', event_title: 'Dropped Seminar', start_date: '2020-06-01', section: 'cancelled', event_status: 'cancelled' })],
    });
    renderPast();
    const tba = await screen.findByRole('region', { name: 'Dates to be announced' });
    const expectations = [
      [rowIn(tba, 'Moved Forum', 3), 'Postponed'],
      [rowIn(tba, 'Dropped Forum', 3), 'Cancelled'],
      [rowIn(document.body, 'Moved Seminar', 3), 'Postponed'],
      [rowIn(screen.getByRole('region', { name: 'Cancelled engagements' }), 'Dropped Seminar', 4), 'Cancelled'],
    ];
    for (const [article, label] of expectations) {
      expect(within(article).getByText(label, visible)).toBeInTheDocument();
      if (label === 'Cancelled') expect(within(article).queryByText('Confirmed')).not.toBeInTheDocument();
    }
    // Confirmed but in the past: not presented as a confirmed appearance either.
    expect(within(rowIn(document.body, 'Moved Seminar', 3)).queryByText('Confirmed')).not.toBeInTheDocument();
    expect(rowIn(tba, 'Dropped Forum', 3).textContent).not.toMatch(/to be announced/i);
  });
});

describe('SpeakingPastPage — filters', () => {
  const FILTERS = { name: 'Filter past engagements' };
  const many = () => ({
    upcoming: [],
    tba: [card({ id: 't1', event_title: 'Undated Workshop', dates_tbc: true, roles: ['facilitator'], section: 'tba' })],
    previous: [
      card({ id: 'p1', event_title: 'Past Keynote', start_date: '2025-05-01', roles: ['keynote_speaker'], topics: ['leadership'], section: 'previous' }),
      card({ id: 'p2', event_title: 'Past Training', start_date: '2025-02-01', roles: ['trainer'], section: 'previous' }),
      card({ id: 'p3', event_title: 'Past Panel', start_date: '2024-09-01', roles: ['panellist'], section: 'previous' }),
      card({ id: 'p4', event_title: 'Past Forum', start_date: '2024-05-01', roles: ['moderator'], topics: ['Leadership'], section: 'previous' }),
      card({ id: 'p5', event_title: 'Past Seminar', start_date: '2023-05-01', roles: ['speaker'], section: 'previous' }),
    ],
    cancelled: [card({ id: 'c1', event_title: 'Called-off Keynote', start_date: '2024-03-01', roles: ['keynote_speaker'], section: 'cancelled', event_status: 'cancelled' })],
  });
  // Past rows sit straight under the page heading, so they're read from the list of years.
  const pastTitles = () => screen.queryAllByRole('heading', { level: 3 })
    .filter((h) => h.closest('article') && !h.closest('section'))
    .map((h) => h.textContent);
  const titlesIn = (region) => within(region).queryAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

  it('stay hidden until there are six or more past engagements', async () => {
    const data = many();
    mocks.fetchEngagements.mockResolvedValue({ ...data, previous: data.previous.slice(0, 4) });
    renderPast();
    await screen.findByRole('heading', { name: 'Past Keynote' });
    expect(screen.queryByRole('search', FILTERS)).not.toBeInTheDocument();
  });

  it('narrow the past engagements and cancellations by role, year and topic', async () => {
    mocks.fetchEngagements.mockResolvedValue(many());
    renderPast();
    const filters = await screen.findByRole('search', FILTERS);
    expect(within(filters).getByText('6 past engagements')).toBeInTheDocument();

    fireEvent.change(within(filters).getByLabelText('Role'), { target: { value: 'keynote_speaker' } });
    expect(pastTitles()).toEqual(['Past Keynote']);
    expect(titlesIn(screen.getByRole('region', { name: 'Cancelled engagements' }))).toEqual(['Called-off Keynote']);
    expect(within(filters).getByText('Showing 2 of 6 past engagements')).toBeInTheDocument();
    // Engagements still to come aren't filtered.
    expect(titlesIn(screen.getByRole('region', { name: 'Dates to be announced' }))).toEqual(['Undated Workshop']);

    fireEvent.change(within(filters).getByLabelText('Year'), { target: { value: '2023' } });
    expect(pastTitles()).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Cancelled engagements' })).not.toBeInTheDocument();
    // The filters stay, so the visitor can change them.
    expect(screen.getByText('No past engagements match these filters.')).toBeInTheDocument();
    expect(screen.getByRole('search', FILTERS)).toBe(filters);

    fireEvent.click(within(filters).getByRole('button', { name: /Clear filters/ }));
    // "leadership" and "Leadership" are one topic, offered as first written, and match both.
    const topic = within(filters).getByLabelText('Topic');
    expect([...topic.options].map((o) => o.value)).toEqual(['', 'leadership']);
    fireEvent.change(topic, { target: { value: 'leadership' } });
    expect(pastTitles()).toEqual(['Past Keynote', 'Past Forum']);
  });

  it('cover the cancellations when nothing in the archive took place', async () => {
    const cancelledOnly = Array.from({ length: 6 }, (_, i) => card({
      id: `c${i}`, event_title: `Called Off ${i}`, start_date: `202${i}-05-01`, section: 'cancelled', event_status: 'cancelled',
    }));
    mocks.fetchEngagements.mockResolvedValue({ upcoming: [], tba: [], previous: [], cancelled: cancelledOnly });
    renderPast();
    const filters = await screen.findByRole('search', FILTERS);
    fireEvent.change(within(filters).getByLabelText('Year'), { target: { value: '2023' } });
    expect(titlesIn(screen.getByRole('region', { name: 'Cancelled engagements' }))).toEqual(['Called Off 3']);
  });
});
