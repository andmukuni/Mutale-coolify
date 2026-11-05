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

  it('lists only dated upcoming engagements, and links to the rest on their own page', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [card({ id: 'u1', event_title: 'Future Summit', start_date: '2099-01-10', section: 'upcoming' })],
      tba: [card({ id: 't1', event_title: 'Undated Forum', dates_tbc: true, section: 'tba' })],
      previous: [
        card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' }),
        card({ id: 'p2', event_title: 'Past Seminar', start_date: '2019-05-01', section: 'previous' }),
      ],
      cancelled: [card({ id: 'c1', event_title: 'Called Off', start_date: '2020-06-01', section: 'cancelled', event_status: 'cancelled' })],
    });
    renderPage();

    const upcoming = await screen.findByRole('region', { name: 'Where I’ll Be Next' });
    expect(within(upcoming).getByText('Upcoming Engagements')).toBeInTheDocument();
    expect(within(upcoming).getByRole('heading', { level: 3, name: 'Future Summit' })).toBeInTheDocument();
    for (const title of ['Undated Forum', 'Past Conference', 'Called Off']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('search')).not.toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Where I’ve Spoken/ });
    expect(link).toHaveAttribute('href', '/speaking/past');
    expect(link).toHaveTextContent('Previous Engagements');
    expect(link).toHaveTextContent('2 past engagements · 1 with dates to be announced · 1 cancelled');
    expect(screen.queryByText('New speaking engagements will be announced here.')).not.toBeInTheDocument();
  });

  it('shows no link to past engagements when there are none', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [card({ id: 'u1', event_title: 'Future Summit', start_date: '2099-01-10', section: 'upcoming' })],
      tba: [], previous: [], cancelled: [],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Future Summit' });
    expect(screen.queryByRole('link', { name: /Where I’ve Spoken/ })).not.toBeInTheDocument();
  });

  it('keeps the empty message under Upcoming when nothing is coming up with a date', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [], cancelled: [],
      tba: [card({ id: 't1', event_title: 'Undated Forum', dates_tbc: true, section: 'tba' })],
      previous: [card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' })],
    });
    renderPage();
    expect(await screen.findByText('New speaking engagements will be announced here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Where I’ve Spoken/ })).toHaveTextContent('1 past engagement · 1 with dates to be announced');
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
  it('shows them on the upcoming cards (the past page has the rest)', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Moved Summit', start_date: '2099-01-10', section: 'upcoming', event_status: 'postponed' }),
        card({ id: 'u2', event_title: 'Dropped Summit', start_date: '2099-02-10', section: 'upcoming', event_status: 'cancelled' }),
      ],
      tba: [], previous: [], cancelled: [],
    });
    renderPage();

    const upcoming = await screen.findByRole('region', { name: 'Where I’ll Be Next' });
    const cardIn = (title) => within(upcoming).getByRole('heading', { level: 3, name: title }).closest('article');
    const visible = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };
    expect(within(cardIn('Moved Summit')).getByText('Postponed', visible)).toBeInTheDocument();
    expect(within(cardIn('Dropped Summit')).getByText('Cancelled', visible)).toBeInTheDocument();
    expect(within(cardIn('Dropped Summit')).queryByText('Confirmed')).not.toBeInTheDocument();
  });
});

// Brief §10 item 9: what Tab visits, in order. user-event isn't installed, so
// this reads the sequence from the DOM rather than pressing Tab.
describe('SpeakingPage — keyboard order', () => {
  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
  const tabbable = (root) => [...root.querySelectorAll(TABBABLE)].filter((el) => el.getAttribute('tabindex') !== '-1');
  const nameOf = (el) => el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent.trim();

  it('visits the invite button, every card, the link to past engagements, then the closing invitation', async () => {
    // Cards carry no other controls; Add to calendar and the event website are on each engagement’s page.
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        card({ id: 'u1', event_title: 'Linked Summit', start_date: '2099-01-10', section: 'upcoming', participation_status: 'invited', event_url: 'https://summit.example.org' }),
        card({ id: 'u2', event_title: 'Plain Forum', start_date: '2099-02-10', section: 'upcoming', participation_status: 'invited', event_url: null }),
      ],
      tba: [], cancelled: [],
      previous: [card({ id: 'p1', event_title: 'Past Conference', start_date: '2020-05-01', section: 'previous' })],
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
      'Previous EngagementsWhere I’ve Spoken1 past engagement',
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

describe('SpeakingPage — upcoming carousel', () => {
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
