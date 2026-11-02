import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    // No unapproved promises about how enquiries are handled.
    expect(screen.getByText('Share a few details about your event and what you have in mind.')).toBeInTheDocument();
    expect(screen.queryByText(/read personally/)).not.toBeInTheDocument();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('sends both invite buttons to the enquiry form on the same page', async () => {
    const { container } = renderPage();
    const invites = screen.getAllByRole('link', { name: /Invite Me to Speak/ });
    expect(invites).toHaveLength(2);
    for (const link of invites) expect(link).toHaveAttribute('href', '#invite');

    const section = container.querySelector('#invite');
    expect(within(section).getByRole('heading', { name: 'Tell me about your event' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: /Send enquiry/ })).toBeInTheDocument();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('hides the closing invitation when it is switched off, but keeps the form', async () => {
    const { container } = renderPage({}, { 'speaking.cta': false });
    expect(screen.getAllByRole('link', { name: /Invite Me to Speak/ })).toHaveLength(1);
    expect(container.querySelector('#invite form')).not.toBeNull();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('hides the download button and quote until they are provided', async () => {
    const { container } = renderPage();
    expect(screen.queryByText(/Download Speaker Profile/)).not.toBeInTheDocument();
    expect(container.querySelector('figcaption')).toBeNull();
    await screen.findByText('New speaking engagements will be announced here.');
  });

  it('uses the approved homepage portrait until another is uploaded, on large screens only', async () => {
    const { container } = renderPage();
    const portrait = screen.getByRole('img', { name: 'Mutale Mubanga' });
    expect(portrait.getAttribute('src')).toMatch(/mutale-navy-suit-and-tie/);
    expect(container.querySelector('figure')).toHaveClass('hidden', 'lg:flex');
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
      [cardIn(screen.getByRole('region', { name: 'Where I’ve Spoken' }), 'Moved Seminar'), 'Postponed'],
      [cardIn(screen.getByRole('region', { name: 'Cancelled engagements' }), 'Dropped Seminar'), 'Cancelled'],
    ];
    for (const [article, label] of expectations) {
      expect(within(article).getByText(label, visible)).toBeInTheDocument();
      if (label === 'Cancelled') expect(within(article).queryByText('Confirmed')).not.toBeInTheDocument();
    }
    // Confirmed but in the past: not presented as a confirmed appearance either.
    expect(within(cardIn(screen.getByRole('region', { name: 'Where I’ve Spoken' }), 'Moved Seminar')).queryByText('Confirmed'))
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

  it('visits the invite button, linked cards only, the closing invitation, then the form', async () => {
    // Invited, so neither card offers "Add to calendar"; the card tests cover that button.
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Linked Summit', start_date: '2099-01-10', section: 'upcoming', participation_status: 'invited', event_url: 'https://summit.example.org' }),
        card({ id: 'u2', event_title: 'Plain Forum', start_date: '2099-02-10', section: 'upcoming', participation_status: 'invited', event_url: null }),
      ],
      tba: [], previous: [], cancelled: [],
    });
    const { container } = renderPage();
    const plain = (await screen.findByRole('heading', { name: 'Plain Forum' })).closest('article');

    expect(tabbable(container).map(nameOf)).toEqual([
      'Invite Me to Speak',
      'Linked Summit — event website (opens in a new tab)',
      'Invite Me to Speak',
      'organiser_name', 'organisation', 'email', 'phone',
      'event_title', 'proposed_start_date', 'proposed_end_date', 'date_undecided', 'timezone',
      'attendance_format', 'location', 'audience', 'audience_size', 'topic', 'requested_role', 'budget', 'message',
      'Send enquiry',
    ]);
    expect(tabbable(plain)).toHaveLength(0);
    // The spam trap is in the form but out of the tab order.
    expect(container.querySelector('input[name="leave_this_blank"]')).not.toBeNull();
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
  const many = () => ({
    upcoming: [
      card({ id: 'u1', event_title: 'Leadership Keynote', start_date: '2099-03-01', roles: ['keynote_speaker'], topics: ['Leadership'] }),
      card({ id: 'u2', event_title: 'Quality Panel', start_date: '2099-04-01', roles: ['panellist'], topics: ['Quality systems'] }),
    ],
    tba: [card({ id: 't1', event_title: 'Undated Workshop', dates_tbc: true, roles: ['facilitator'], section: 'tba' })],
    previous: [
      card({ id: 'p1', event_title: 'Past Keynote', start_date: '2025-05-01', roles: ['keynote_speaker'], topics: ['leadership'], section: 'previous' }),
      card({ id: 'p2', event_title: 'Past Training', start_date: '2024-02-01', roles: ['trainer'], section: 'previous' }),
      card({ id: 'p3', event_title: 'Past Panel', start_date: '2024-09-01', roles: ['panellist'], section: 'previous' }),
    ],
    cancelled: [],
  });

  it('stay hidden until there are enough engagements to need them', async () => {
    mocks.fetchEngagements.mockResolvedValue({ ...many(), previous: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Leadership Keynote' });
    expect(screen.queryByRole('search', { name: 'Filter speaking engagements' })).not.toBeInTheDocument();
  });

  it('narrow every section by role, year and topic, and can be cleared', async () => {
    mocks.fetchEngagements.mockResolvedValue(many());
    renderPage();
    const filters = await screen.findByRole('search', { name: 'Filter speaking engagements' });
    expect(within(filters).getByText('6 engagements')).toBeInTheDocument();

    fireEvent.change(within(filters).getByLabelText('Role'), { target: { value: 'keynote_speaker' } });
    expect(screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent))
      .toEqual(['Leadership Keynote', 'Past Keynote']);
    expect(within(filters).getByText('Showing 2 of 6 engagements')).toBeInTheDocument();

    fireEvent.change(within(filters).getByLabelText('Year'), { target: { value: '2025' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('No upcoming engagements match these filters.')).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('button', { name: /Clear filters/ }));
    fireEvent.change(within(filters).getByLabelText('Topic'), { target: { value: 'Leadership' } });
    // Topics match regardless of case.
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});

describe('SpeakingPage — invite link and counting', () => {
  it('jumps to the enquiry form only after the listings above it have loaded', async () => {
    let resolve;
    mocks.fetchEngagements.mockReturnValue(new Promise((r) => { resolve = r; }));
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;

    renderPage({}, {}, { path: '/speaking#invite' });
    expect(scroll).not.toHaveBeenCalled();

    await act(async () => { resolve({ upcoming: [card({ id: 'u1', event_title: 'Soon', start_date: '2099-01-01' })], tba: [], previous: [], cancelled: [] }); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('invite'));
    // Keyboard and screen-reader users land there too; the next Tab reaches the first field.
    const heading = screen.getByRole('heading', { name: 'Tell me about your event' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('counts speaker profile downloads', async () => {
    renderPage({ speakerProfileFile: '/uploads/speaking/speaker-profile-1.pdf' });
    fireEvent.click(screen.getByRole('link', { name: /Download Speaker Profile/ }));
    expect(mocks.track).toHaveBeenCalledWith('profile_download');
    await screen.findByText('New speaking engagements will be announced here.');
  });
});
