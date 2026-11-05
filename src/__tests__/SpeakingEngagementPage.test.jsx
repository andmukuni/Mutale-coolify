import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ fetchOne: vi.fn(), track: vi.fn() }));

vi.mock('../utils/speakingApi', () => ({ fetchPublicSpeakingEngagement: mocks.fetchOne }));
vi.mock('../utils/speakingMetrics', () => ({ trackSpeaking: mocks.track }));
vi.mock('../context/DataContext', () => ({ useData: () => ({ profile: {} }) }));

import SpeakingEngagementDetails from '../components/speaking/SpeakingEngagementDetails';
import SpeakingEngagementPage from '../pages/SpeakingEngagementPage';

const BASE = {
  id: 'spk-1',
  event_title: 'BMSZ2026 Scientific Conference',
  organiser: 'Biomedical Society of Zambia',
  event_type: 'conference',
  roles: ['speaker'],
  session_title: 'Welcome remarks',
  description: 'The conference will examine the role of laboratory systems.\nA second paragraph.',
  dates_tbc: false,
  start_date: '2099-12-01',
  end_date: '2099-12-04',
  session_date: '2099-12-01',
  session_start_time: '09:00:00',
  session_end_time: '09:30:00',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  venue: 'Radisson Blu Mosi Oa Tunya',
  city: 'Livingstone',
  country: 'Zambia',
  audience_access: 'public',
  event_url: 'https://bmsz.org/conference',
  topics: ['Laboratory Systems', 'Leadership'],
  media: [],
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
};

beforeEach(() => {
  mocks.fetchOne.mockReset();
  mocks.track.mockReset();
});

describe('SpeakingEngagementDetails — the event website', () => {
  it('is a native link to the event site, opening in a new tab safely, and counted when used', () => {
    render(<SpeakingEngagementDetails engagement={BASE} />);
    const link = screen.getByRole('link', { name: 'Event website (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://bmsz.org/conference');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    fireEvent.click(link);
    expect(mocks.track).toHaveBeenCalledWith('event_website_click', 'spk-1');
  });

  // Brief §10 items 4 and 5, now on the engagement's page.
  it('shows no website button when there is no address, or when it is unsafe, or once it is removed', () => {
    const { rerender } = render(<SpeakingEngagementDetails engagement={{ ...BASE, event_url: 'javascript:alert(1)' }} />);
    expect(screen.queryByRole('link', { name: /Event website/ })).not.toBeInTheDocument();
    rerender(<SpeakingEngagementDetails engagement={BASE} />);
    expect(screen.getByRole('link', { name: /Event website/ })).toBeInTheDocument();
    rerender(<SpeakingEngagementDetails engagement={{ ...BASE, event_url: '' }} />);
    expect(screen.queryByRole('link', { name: /Event website/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Event website')).not.toBeInTheDocument();
  });

  it('does not count clicks in the admin preview', () => {
    render(<SpeakingEngagementDetails engagement={BASE} track={false} />);
    fireEvent.click(screen.getByRole('link', { name: /Event website/ }));
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('SpeakingEngagementDetails — everything the card leaves out', () => {
  it('leads with Mutale’s session: its title, role and time', () => {
    render(<SpeakingEngagementDetails engagement={BASE} />);
    const session = within(screen.getByRole('region', { name: 'Mutale’s session' }));
    expect(session.getByText('Welcome remarks')).toBeInTheDocument();
    expect(session.getByText('Speaker')).toBeInTheDocument();
    expect(session.getByText('1 Dec 2099, 09:00–09:30 (GMT+2)')).toBeInTheDocument();
  });

  it('lists the dates, the place with its venue, and the organiser beside it', () => {
    render(<SpeakingEngagementDetails engagement={BASE} />);
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('1–4 December 2099')).toBeInTheDocument();
    expect(within(details).getByText('Radisson Blu Mosi Oa Tunya, Livingstone, Zambia')).toBeInTheDocument();
    expect(within(details).getByText('Biomedical Society of Zambia')).toBeInTheDocument();
    expect(within(details).queryByText('Welcome remarks')).not.toBeInTheDocument();
    // It stays in view while the visitor reads, except in the admin preview's scrolling dialog.
    expect(details).toHaveClass('lg:sticky');
  });

  it('keeps the details still in the admin preview', () => {
    render(<SpeakingEngagementDetails engagement={BASE} track={false} stickyDetails={false} />);
    expect(screen.getByRole('region', { name: 'Details' })).not.toHaveClass('lg:sticky');
  });

  it('shows the whole description, keeping its line breaks, and the topics', () => {
    render(<SpeakingEngagementDetails engagement={BASE} />);
    const about = within(screen.getByRole('region', { name: 'About this engagement' }));
    const text = about.getByText(/role of laboratory systems/);
    expect(text).toHaveClass('whitespace-pre-line');
    expect(text.className).not.toMatch(/line-clamp/);
    expect(about.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Laboratory Systems', 'Leadership']);
  });

  it('keeps recordings and slides as safe new-tab links, and drops unsafe ones', () => {
    const media = [
      { type: 'recording', url: 'https://video.example.org/talk', label: null },
      { type: 'slides', url: 'https://example.org/slides.pdf', label: 'Download the slides' },
      { type: 'article', url: 'javascript:alert(1)', label: null },
    ];
    render(<SpeakingEngagementDetails engagement={{ ...BASE, section: 'previous', media }} />);
    const recording = screen.getByRole('link', { name: 'Watch recording: BMSZ2026 Scientific Conference (opens in a new tab)' });
    expect(recording).toHaveAttribute('href', 'https://video.example.org/talk');
    expect(recording).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /^Download the slides: / })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Read article/ })).not.toBeInTheDocument();
  });

  it('offers Add to calendar only for confirmed, scheduled, upcoming engagements', () => {
    const { rerender } = render(<SpeakingEngagementDetails engagement={BASE} />);
    expect(screen.getByRole('button', { name: /^Add to calendar:/ })).toBeInTheDocument();
    for (const change of [
      { participation_status: 'invited' },
      { event_status: 'postponed' },
      { event_status: 'cancelled' },
      { section: 'previous' },
      { dates_tbc: true, start_date: null, end_date: null, section: 'tba' },
    ]) {
      rerender(<SpeakingEngagementDetails engagement={{ ...BASE, ...change }} />);
      expect(screen.queryByRole('button', { name: /^Add to calendar:/ })).not.toBeInTheDocument();
    }
  });

  it('leaves out empty sections and never shows "null"', () => {
    const { container } = render(<SpeakingEngagementDetails engagement={{
      id: 'x', event_title: 'Minimal', roles: [], dates_tbc: true, start_date: null,
      participation_status: 'invited', event_status: 'scheduled', section: 'tba', media: [], topics: [],
    }}
    />);
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(screen.queryByRole('region', { name: 'About this engagement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mutale’s session' })).not.toBeInTheDocument();
    expect(screen.getByText('Dates to be announced')).toBeInTheDocument();
  });
});

describe('SpeakingEngagementPage', () => {
  const renderPage = ({ path = '/speaking/spk-1', state } = {}) => render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/speaking/:id" element={<SpeakingEngagementPage />} />
        <Route path="/speaking" element={<p>Speaking page</p>} />
      </Routes>
    </MemoryRouter>,
  );

  it('loads the engagement by its id and shows it with a way back', async () => {
    mocks.fetchOne.mockResolvedValue(BASE);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' })).toBeInTheDocument();
    expect(mocks.fetchOne).toHaveBeenCalledWith('spk-1');
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All speaking engagements' })).toHaveAttribute('href', '/speaking');
    expect(screen.getByRole('link', { name: /Event website/ })).toBeInTheDocument();
  });

  it('gives the key facts under the title, beside the photo with its date', async () => {
    mocks.fetchOne.mockResolvedValue({ ...BASE, image_url: 'https://cdn.example.org/mutale.jpg', image_alt: 'Mutale speaking' });
    renderPage();
    const banner = (await screen.findByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' })).closest('section');
    const facts = within(within(banner).getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
    // City and country here; the venue is in the details.
    expect(facts).toEqual(['1–4 December 2099', 'Livingstone, Zambia', 'Speaker']);
    expect(within(banner).getByRole('img', { name: 'Mutale speaking' })).toBeInTheDocument();
    const badge = within(banner).getByText('01–04').parentElement;
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(within(badge).getByText('Dec')).toBeInTheDocument();
  });

  it('shows the event-type panel when the photo fails to load, on wide screens only', async () => {
    mocks.fetchOne.mockResolvedValue({ ...BASE, image_url: 'https://cdn.example.org/missing.jpg', image_alt: 'Mutale speaking' });
    renderPage();
    const banner = (await screen.findByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' })).closest('section');
    fireEvent.error(within(banner).getByRole('img', { name: 'Mutale speaking' }));
    expect(within(banner).queryByRole('img')).not.toBeInTheDocument();
    const panel = banner.querySelector('[class*="from-navy-950 via"]');
    expect(panel.closest('.hidden.lg\\:block')).not.toBeNull();
  });

  it('ends with the invitation to book Mutale', async () => {
    mocks.fetchOne.mockResolvedValue(BASE);
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' });
    expect(screen.getByRole('link', { name: /Invite Me to Speak/ })).toHaveAttribute('href', '/speaking/invite');
  });

  it('leads back to the past engagements page from a past, cancelled or undated engagement', async () => {
    const cases = [
      [{ section: 'previous', start_date: '2020-05-01', end_date: null }, 'All past engagements'],
      [{ section: 'cancelled', start_date: '2020-05-01', end_date: null, event_status: 'cancelled' }, 'All past engagements'],
      [{ section: 'tba', dates_tbc: true, start_date: null, end_date: null }, 'More speaking engagements'],
    ];
    for (const [overrides, label] of cases) {
      mocks.fetchOne.mockResolvedValue({ ...BASE, ...overrides });
      const { unmount } = renderPage();
      expect(await screen.findByRole('link', { name: label })).toHaveAttribute('href', '/speaking/past');
      unmount();
    }
  });

  it('shows the engagement a card passed at once, then the latest copy', async () => {
    let resolve;
    mocks.fetchOne.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage({ state: { engagement: BASE } });
    expect(screen.getByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' })).toBeInTheDocument();
    await act(async () => { resolve({ ...BASE, event_title: 'BMSZ2026 Annual Conference' }); });
    expect(screen.getByRole('heading', { level: 1, name: 'BMSZ2026 Annual Conference' })).toBeInTheDocument();
  });

  it('says so when the engagement is not published, without showing anything passed for another one', async () => {
    mocks.fetchOne.mockResolvedValue(null);
    renderPage({ state: { engagement: { ...BASE, id: 'spk-2' } } });
    expect(await screen.findByText(/isn’t available/)).toBeInTheDocument();
    expect(screen.queryByText('BMSZ2026 Scientific Conference')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all speaking engagements' })).toHaveAttribute('href', '/speaking');
  });

  it('offers a retry when the engagement cannot be loaded', async () => {
    mocks.fetchOne.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(BASE);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'BMSZ2026 Scientific Conference' })).toBeInTheDocument();
    expect(mocks.fetchOne).toHaveBeenCalledTimes(2);
  });
});
