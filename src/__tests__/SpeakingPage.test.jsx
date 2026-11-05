import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultWebsitePages, mergeWebsitePages } from '../data/websitePages';
import { DEFAULT_MENU_ITEMS, buildMenuTree } from '../../shared/menuItems.js';
import { navLinks } from '../config/siteHeader.js';

const mocks = vi.hoisted(() => ({ profile: {}, fetchEngagements: vi.fn(), track: vi.fn() }));

vi.mock('../context/DataContext', () => ({ useData: () => ({ profile: mocks.profile }) }));
vi.mock('../utils/speakingApi', () => ({
  fetchPublicSpeakingEngagements: mocks.fetchEngagements,
  fetchEnquiryToken: () => Promise.resolve('test-token'),
  submitSpeakingEnquiry: vi.fn(),
}));
vi.mock('../utils/speakingMetrics', () => ({ trackSpeaking: mocks.track }));

import SpeakingPage from '../pages/SpeakingPage';
import SpeakingInvitePage from '../pages/SpeakingInvitePage';

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

function renderPage(speaking = {}, sectionVisibility = {}, { path = '/speaking' } = {}) {
  mocks.profile = { websitePages: { ...defaultWebsitePages, speaking: { ...defaultWebsitePages.speaking, ...speaking }, sectionVisibility } };
  return render(<MemoryRouter initialEntries={[path]}><SpeakingPage /></MemoryRouter>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.track.mockReset();
  mocks.fetchEngagements.mockReset();
  mocks.fetchEngagements.mockResolvedValue({ upcoming: [], previous: [], tba: [] });
});

describe('SpeakingPage — introduction', () => {
  it('uses the approved copy from the brief', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Conversations that Create Change' })).toBeInTheDocument();
    expect(screen.getByText(/Keynotes, panel discussions, workshops, and facilitated conversations/)).toBeInTheDocument();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('sends both invite buttons to the Invite Me to Speak page, with no form on this one', async () => {
    const { container } = renderPage();
    const invites = screen.getAllByRole('link', { name: /Invite Me to Speak/ });
    expect(invites).toHaveLength(2);
    for (const link of invites) expect(link).toHaveAttribute('href', '/speaking/invite');
    expect(container.querySelector('form')).toBeNull();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('keeps the banner’s invite button when the closing invitation is switched off', async () => {
    renderPage({}, { 'speaking.cta': false });
    expect(screen.getAllByRole('link', { name: /Invite Me to Speak/ })).toHaveLength(1);
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('hides the download button and quote until they are provided', async () => {
    const { container } = renderPage();
    expect(screen.queryByText(/Download Speaker Profile/)).not.toBeInTheDocument();
    expect(container.querySelector('figcaption')).toBeNull();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('uses the approved homepage portrait until another is uploaded, on wide screens only', async () => {
    const { container } = renderPage();
    const portrait = screen.getByRole('img', { name: 'Mutale Mubanga' });
    expect(portrait.getAttribute('src')).toMatch(/mutale-navy-suit-and-tie/);
    expect(container.querySelector('figure')).toHaveClass('hidden', 'xl:flex');
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('shows the download button once an approved profile is uploaded', async () => {
    renderPage({ speakerProfileFile: '/uploads/speaking/speaker-profile-1.pdf' });
    const link = screen.getByRole('link', { name: /Download Speaker Profile \(PDF\)/ });
    expect(link.getAttribute('href')).toMatch(/\/uploads\/speaking\/speaker-profile-1\.pdf$/);
    expect(link).toHaveAttribute('download');
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('shows an uploaded portrait with its alt text', async () => {
    renderPage({ heroPortraitImage: '/uploads/site/portrait.jpg', heroPortraitAlt: 'Mutale Mubanga speaking' });
    expect(screen.getByRole('img', { name: 'Mutale Mubanga speaking' })).toBeInTheDocument();
    await screen.findByText('New speaking engagements will be announced here.');
  });
});

describe('SpeakingPage — speaking formats', () => {
  it('describes the four formats without creating any links', async () => {
    renderPage();
    const strip = screen.getByRole('region', { name: 'Speaking formats' });
    for (const title of ['Keynotes', 'Workshops', 'Panel Discussions', 'Facilitation']) {
      expect(within(strip).getByText(title)).toBeInTheDocument();
    }
    expect(within(strip).queryAllByRole('link')).toHaveLength(0);
    expect(within(strip).queryAllByRole('button')).toHaveLength(0);
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('can be switched off in Sections', async () => {
    renderPage({}, { 'speaking.formats': false });
    expect(screen.queryByRole('region', { name: 'Speaking formats' })).not.toBeInTheDocument();
    await screen.findByText('New speaking engagements will be announced here.');
  });
});

describe('SpeakingPage — engagement sections', () => {
  it('shows the empty state and no invented events when nothing is published', async () => {
    renderPage();
    expect(await screen.findByText('New speaking engagements will be announced here.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Where I’ve Spoken' })).not.toBeInTheDocument();
  });

  it('labels upcoming, to-be-announced, and previous engagements in separate sections', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [card({ id: 'u1', event_title: 'Future Summit', start_date: '2099-01-10', section: 'upcoming' })],
      tba: [card({ id: 't1', event_title: 'Undated Forum', dates_tbc: true, section: 'tba' })],
      previous: [card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' })],
    });
    renderPage();

    const upcoming = await screen.findByRole('region', { name: 'Where I’ll Be Next' });
    expect(within(upcoming).getByText('Upcoming Engagements')).toBeInTheDocument();
    expect(within(upcoming).getByRole('heading', { level: 3, name: 'Future Summit' })).toBeInTheDocument();
    expect(within(upcoming).getByRole('heading', { level: 3, name: 'Dates to be announced' })).toBeInTheDocument();
    expect(within(upcoming).getByRole('heading', { level: 4, name: 'Undated Forum' })).toBeInTheDocument();

    const previous = screen.getByRole('region', { name: 'Where I’ve Spoken' });
    expect(within(previous).getByText('Previous Engagements')).toBeInTheDocument();
    expect(within(previous).getByRole('heading', { name: 'Past Conference' })).toBeInTheDocument();
    expect(screen.queryByText('New speaking engagements will be announced here.')).not.toBeInTheDocument();
  });

  it('keeps the empty message under Upcoming when only past engagements exist', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], tba: [], previous: [card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' })],
    });
    renderPage();
    expect(await screen.findByText('New speaking engagements will be announced here.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Past Conference' })).toBeInTheDocument();
  });

  it('offers a retry when the engagements cannot be loaded', async () => {
    mocks.fetchEngagements.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be loaded');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('keeps focus on the Upcoming heading while retrying, and on “Try again” if it fails again', async () => {
    mocks.fetchEngagements
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ upcoming: [card({ id: 'u1', event_title: 'Back Online', start_date: '2099-01-10' })], tba: [], previous: [] });
    renderPage();
    const heading = screen.getByRole('heading', { level: 2, name: 'Where I’ll Be Next' });

    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Loading speaking engagements…');
    const again = await screen.findByRole('button', { name: /Try again/ });
    expect(again).toHaveFocus();

    fireEvent.click(again);
    expect(await screen.findByRole('heading', { name: 'Back Online' })).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

// Brief §10 item 7: the labels survive into every section on the page.
describe('SpeakingPage — postponed and cancelled labels', () => {
  it('shows them on the cards in Upcoming, Dates to be announced, Previous and Cancelled', async () => {
    const undated = { dates_tbc: true, start_date: null };
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Moved Summit', start_date: '2099-01-10', section: 'upcoming', event_status: 'postponed' }),
        card({ id: 'u2', event_title: 'Dropped Summit', start_date: '2099-02-10', section: 'upcoming', event_status: 'cancelled' }),
      ],
      tba: [
        card({ id: 't1', event_title: 'Moved Forum', ...undated, section: 'tba', event_status: 'postponed' }),
        card({ id: 't2', event_title: 'Dropped Forum', ...undated, section: 'tba', event_status: 'cancelled' }),
      ],
      previous: [card({ id: 'p1', event_title: 'Moved Seminar', start_date: '2020-05-01', section: 'previous', event_status: 'postponed' })],
      cancelled: [card({ id: 'c1', event_title: 'Dropped Seminar', start_date: '2020-06-01', section: 'cancelled', event_status: 'cancelled' })],
    });
    renderPage();

    const upcoming = await screen.findByRole('region', { name: 'Where I’ll Be Next' });
    const cardIn = (region, title, level = 3) => within(region).getByRole('heading', { level, name: title }).closest('article');
    const visible = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };
    const expectations = [
      [cardIn(upcoming, 'Moved Summit'), 'Postponed'],
      [cardIn(upcoming, 'Dropped Summit'), 'Cancelled'],
      [cardIn(upcoming, 'Moved Forum', 4), 'Postponed'],
      [cardIn(upcoming, 'Dropped Forum', 4), 'Cancelled'],
      // Past engagements are rows under a heading for their year.
      [cardIn(screen.getByRole('region', { name: 'Where I’ve Spoken' }), 'Moved Seminar', 4), 'Postponed'],
      [cardIn(screen.getByRole('region', { name: 'Cancelled engagements' }), 'Dropped Seminar', 4), 'Cancelled'],
    ];
    for (const [article, label] of expectations) {
      expect(within(article).getByText(label, visible)).toBeInTheDocument();
      if (label === 'Cancelled') expect(within(article).queryByText('Confirmed')).not.toBeInTheDocument();
    }
    // Confirmed but in the past: not presented as a confirmed appearance either.
    expect(within(cardIn(screen.getByRole('region', { name: 'Where I’ve Spoken' }), 'Moved Seminar', 4)).queryByText('Confirmed'))
      .not.toBeInTheDocument();
    expect(cardIn(upcoming, 'Dropped Forum', 4).textContent).not.toMatch(/to be announced/i);
  });
});

// Brief §10 item 9: what Tab visits, in order. user-event isn't installed, so
// this reads the sequence from the DOM rather than pressing Tab.
describe('SpeakingPage — keyboard order', () => {
  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
  const tabbable = (root) => [...root.querySelectorAll(TABBABLE)].filter((el) => el.getAttribute('tabindex') !== '-1');
  const nameOf = (el) => el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent.trim();

  it('visits the invite button, every card, then the closing invitation', async () => {
    // Cards carry no other controls; Add to calendar and the event website are on each engagement’s page.
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Linked Summit', start_date: '2099-01-10', section: 'upcoming', participation_status: 'invited', event_url: 'https://summit.example.org' }),
        card({ id: 'u2', event_title: 'Plain Forum', start_date: '2099-02-10', section: 'upcoming', participation_status: 'invited', event_url: null }),
      ],
      tba: [], previous: [], cancelled: [],
    });
    const { container } = renderPage();
    const plain = (await screen.findByRole('heading', { name: 'Plain Forum' })).closest('article');

    // Every card opens its own page, whether or not the event has a website.
    // The carousel's controls follow the cards. (Tests have no layout, so one
    // card is in view, as on phones; with two in view the controls aren't shown.)
    expect(tabbable(container).map(nameOf)).toEqual([
      'Invite Me to Speak',
      'Linked Summit',
      'Plain Forum',
      'Engagement 1',
      'Engagement 2',
      'Previous engagement',
      'Next engagement',
      'Invite Me to Speak',
    ]);
    expect(tabbable(plain)).toHaveLength(1);
  });
});

describe('Speaking page wiring', () => {
  it('keeps saved Speaking copy when website pages are merged', () => {
    const merged = mergeWebsitePages({ speaking: { heroTitle: 'Edited heading' } });
    expect(merged.speaking.heroTitle).toBe('Edited heading');
    expect(merged.speaking.primaryButtonLabel).toBe('Invite Me to Speak');
  });

  it('adds Speaking to the main navigation after About', () => {
    const tree = buildMenuTree(DEFAULT_MENU_ITEMS.map((item) => ({ ...item, is_visible: true })), { location: 'main' });
    const labels = tree.map((link) => link.label);
    expect(labels.indexOf('Speaking')).toBe(labels.indexOf('About') + 1);
    expect(tree.find((link) => link.label === 'Speaking').to).toBe('/speaking');
    expect(navLinks.map((link) => link.to)).toContain('/speaking');
  });
});

describe('SpeakingPage — past engagements', () => {
  it('lists them as compact rows under a heading for each year, most recent first, each opening its page', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], tba: [], cancelled: [],
      previous: [
        card({ id: 'p1', event_title: 'Accreditation Masterclass', event_type: 'workshop', roles: ['trainer'], start_date: '2026-09-28', end_date: '2026-10-02', city: 'Lusaka', country: 'Zambia', audience_access: 'public', section: 'previous' }),
        card({ id: 'p2', event_title: 'Quality Week Forum', start_date: '2026-06-10', section: 'previous', participation_status: 'invited' }),
        card({ id: 'p3', event_title: 'Lab Leaders Summit', start_date: '2025-11-14', section: 'previous' }),
      ],
    });
    renderPage();
    const previous = await screen.findByRole('region', { name: 'Where I’ve Spoken' });
    expect(within(previous).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['2026', '2025']);

    const row = within(previous).getByRole('heading', { level: 4, name: 'Accreditation Masterclass' }).closest('article');
    expect(within(row).getByText('28 Sep – 2 Oct')).toBeInTheDocument();
    expect(within(row).getByText('Workshop · Trainer · Lusaka, Zambia')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Accreditation Masterclass' })).toHaveAttribute('href', '/speaking/p1');
    // One link per row, and no "Open to the public" once the event is over.
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(within(row).queryByText('Open to the public')).not.toBeInTheDocument();
    // An unconfirmed invitation still says so, so it never reads as a talk given.
    const invited = within(previous).getByRole('heading', { level: 4, name: 'Quality Week Forum' }).closest('article');
    expect(within(invited).getByText('Invited')).toBeInTheDocument();
  });
});

describe('SpeakingPage — past cancellations', () => {
  it('lists them under their own heading, never under “Where I’ve Spoken”', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], tba: [],
      previous: [card({ id: 'p1', event_title: 'Took Place', start_date: '2020-05-01', section: 'previous' })],
      cancelled: [card({ id: 'c1', event_title: 'Called Off', start_date: '2020-06-01', section: 'cancelled', event_status: 'cancelled' })],
    });
    renderPage();
    const cancelled = await screen.findByRole('region', { name: 'Cancelled engagements' });
    expect(within(cancelled).getByRole('heading', { name: 'Called Off' })).toBeInTheDocument();
    expect(within(cancelled).getByText('Cancelled')).toBeInTheDocument();
    const previous = screen.getByRole('region', { name: 'Where I’ve Spoken' });
    expect(within(previous).queryByText('Called Off')).not.toBeInTheDocument();
  });
});

describe('SpeakingPage — filters', () => {
  const FILTERS = { name: 'Filter past engagements' };
  const many = () => ({
    upcoming: [
      card({ id: 'u1', event_title: 'Leadership Keynote', start_date: '2099-03-01', roles: ['keynote_speaker'], topics: ['Leadership'], section: 'upcoming' }),
    ],
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
  const titlesIn = (region) => within(region).queryAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

  it('stay hidden until the archive is large enough to need them, however much is coming up', async () => {
    const data = many();
    mocks.fetchEngagements.mockResolvedValue({
      ...data,
      upcoming: [...data.upcoming, ...data.previous.map((e) => ({ ...e, id: `u-${e.id}`, start_date: '2099-06-01', section: 'upcoming' }))],
      previous: data.previous.slice(0, 4),
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Leadership Keynote' });
    expect(screen.queryByRole('search', FILTERS)).not.toBeInTheDocument();
  });

  it('sit under “Where I’ve Spoken” and narrow only the past, by role, year and topic', async () => {
    mocks.fetchEngagements.mockResolvedValue(many());
    renderPage();
    const previous = await screen.findByRole('region', { name: 'Where I’ve Spoken' });
    const filters = within(previous).getByRole('search', FILTERS);
    expect(within(filters).getByText('6 past engagements')).toBeInTheDocument();
    const upcoming = screen.getByRole('region', { name: 'Where I’ll Be Next' });

    fireEvent.change(within(filters).getByLabelText('Role'), { target: { value: 'keynote_speaker' } });
    expect(titlesIn(previous)).toEqual(['Past Keynote']);
    expect(titlesIn(screen.getByRole('region', { name: 'Cancelled engagements' }))).toEqual(['Called-off Keynote']);
    expect(within(filters).getByText('Showing 2 of 6 past engagements')).toBeInTheDocument();
    // What's coming up stays in full.
    expect(titlesIn(upcoming)).toEqual(['Leadership Keynote', 'Undated Workshop']);

    fireEvent.change(within(filters).getByLabelText('Year'), { target: { value: '2023' } });
    expect(titlesIn(previous)).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Cancelled engagements' })).not.toBeInTheDocument();
    // The filters stay, so the visitor can change them.
    expect(within(previous).getByText('No past engagements match these filters.')).toBeInTheDocument();
    expect(within(previous).getByRole('search', FILTERS)).toBe(filters);

    fireEvent.click(within(filters).getByRole('button', { name: /Clear filters/ }));
    // "leadership" and "Leadership" are one topic, offered as first written, and match both.
    const topic = within(filters).getByLabelText('Topic');
    expect([...topic.options].map((o) => o.value)).toEqual(['', 'leadership']);
    fireEvent.change(topic, { target: { value: 'leadership' } });
    expect(titlesIn(previous)).toEqual(['Past Keynote', 'Past Forum']);
  });

  it('move to the cancellations when nothing in the archive took place', async () => {
    const cancelledOnly = Array.from({ length: 6 }, (_, i) => card({
      id: `c${i}`, event_title: `Called Off ${i}`, start_date: `202${i}-05-01`, section: 'cancelled', event_status: 'cancelled',
    }));
    mocks.fetchEngagements.mockResolvedValue({ upcoming: [], tba: [], previous: [], cancelled: cancelledOnly });
    renderPage();
    const cancelled = await screen.findByRole('region', { name: 'Cancelled engagements' });
    expect(within(cancelled).getByRole('search', FILTERS)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Where I’ve Spoken' })).not.toBeInTheDocument();
  });
});

describe('SpeakingPage — upcoming carousel and undated rows', () => {
  it('shows upcoming engagements as cards in a carousel, labelled only where they differ from the usual', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Confirmed Summit', start_date: '2099-01-10', section: 'upcoming', audience_access: 'public' }),
        card({ id: 'u2', event_title: 'Private Workshop', start_date: '2099-02-10', section: 'upcoming', audience_access: 'invitation_only', participation_status: 'invited' }),
      ],
      tba: [], previous: [], cancelled: [],
    });
    renderPage();
    const upcoming = await screen.findByRole('region', { name: 'Where I’ll Be Next' });
    const carousel = within(upcoming).getByRole('group', { name: 'Upcoming engagements' });
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    expect(within(within(carousel).getByRole('list')).getAllByRole('listitem')).toHaveLength(2);

    const confirmed = within(upcoming).getByRole('heading', { level: 3, name: 'Confirmed Summit' }).closest('article');
    expect(within(confirmed).getByRole('link')).toHaveAttribute('href', '/speaking/u1');
    // "Confirmed" and "Open to the public" are on the engagement's page instead.
    expect(within(confirmed).queryByText('Confirmed')).not.toBeInTheDocument();
    expect(within(confirmed).queryByText('Open to the public')).not.toBeInTheDocument();

    const invited = within(upcoming).getByRole('heading', { level: 3, name: 'Private Workshop' }).closest('article');
    expect(within(invited).getByText('Invited')).toBeInTheDocument();
    expect(within(invited).getByText('Invitation only')).toBeInTheDocument();
  });

  it('lists engagements with dates to be announced as rows, without a date', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [],
      tba: [card({ id: 't1', event_title: 'Undated Forum', dates_tbc: true, event_type: 'forum', city: 'Ndola', country: 'Zambia', section: 'tba', audience_access: 'invitation_only' })],
      previous: [], cancelled: [],
    });
    renderPage();
    const row = (await screen.findByRole('heading', { level: 4, name: 'Undated Forum' })).closest('article');
    expect(within(row).getByText('Forum · Speaker · Ndola, Zambia')).toBeInTheDocument();
    expect(within(row).getByText('Invitation only')).toBeInTheDocument();
    expect(within(row).queryByText('Confirmed')).not.toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/speaking/t1');
    expect(row.querySelectorAll('p')).toHaveLength(1);
  });
});

describe('SpeakingPage — invite link and counting', () => {
  it('sends old links to the form’s place on this page to the Invite Me to Speak page', async () => {
    mocks.profile = { websitePages: { ...defaultWebsitePages, sectionVisibility: {} } };
    render(
      <MemoryRouter initialEntries={['/speaking#invite']}>
        <Routes>
          <Route path="/speaking" element={<SpeakingPage />} />
          <Route path="/speaking/invite" element={<SpeakingInvitePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell me about your event' })).toBeInTheDocument();
    expect(mocks.fetchEngagements).not.toHaveBeenCalled();
  });

  it('counts speaker profile downloads', async () => {
    renderPage({ speakerProfileFile: '/uploads/speaking/speaker-profile-1.pdf' });
    fireEvent.click(screen.getByRole('link', { name: /Download Speaker Profile/ }));
    expect(mocks.track).toHaveBeenCalledWith('profile_download');
    await screen.findByText('New speaking engagements will be announced here.');
  });
});

describe('SpeakingInvitePage', () => {
  function renderInvite(speaking = {}) {
    mocks.profile = { websitePages: { ...defaultWebsitePages, speaking: { ...defaultWebsitePages.speaking, ...speaking } } };
    return render(<MemoryRouter initialEntries={['/speaking/invite']}><SpeakingInvitePage /></MemoryRouter>);
  }

  it('uses the approved copy and starts the form at its first step', async () => {
    renderInvite();
    expect(screen.getByRole('heading', { level: 1, name: 'Tell me about your event' })).toBeInTheDocument();
    expect(screen.getByText('Share a few details about your event and what you have in mind.')).toBeInTheDocument();
    // No unapproved promises about how enquiries are handled.
    expect(screen.queryByText(/read personally/)).not.toBeInTheDocument();
    expect(screen.getByText(/does not confirm availability/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Step 1 of 4.*About you/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Speaking' })).toHaveAttribute('href', '/speaking');
    await act(async () => {});
  });

  it('shows the copy saved in Sections', async () => {
    renderInvite({ enquiryTitle: 'Bring Mutale to your event', enquiryIntro: 'A few questions first.' });
    expect(screen.getByRole('heading', { level: 1, name: 'Bring Mutale to your event' })).toBeInTheDocument();
    expect(screen.getByText('A few questions first.')).toBeInTheDocument();
    await act(async () => {});
  });
});
