import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';

const mocks = vi.hoisted(() => ({ fetchEngagements: vi.fn(), consent: false }));

vi.mock('../utils/speakingApi', () => ({ fetchPublicSpeakingEngagements: mocks.fetchEngagements }));
vi.mock('../utils/cookieConsent', () => ({ hasConsent: (category) => category === 'analytics' && mocks.consent }));

import NextSpeakingEngagement from '../components/speaking/NextSpeakingEngagement';
import { countdownLabel, pickNextEngagement } from '../components/speaking/nextEngagement';
import { applyFilters, filterOptions } from '../components/speaking/engagementFilterRules';
import { trackSpeaking } from '../utils/speakingMetrics';
import Modal from '../components/ui/Modal';

const engagement = (overrides) => ({
  id: 'spk-x',
  event_title: 'Engagement',
  roles: ['speaker'],
  timezone: 'Africa/Lusaka',
  start_date: '2099-01-10',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.consent = false;
});

describe('Next Speaking Engagement (homepage)', () => {
  it('promotes the featured engagement, otherwise the next confirmed one', () => {
    const next = engagement({ id: 'a', event_title: 'Next' });
    const featured = engagement({ id: 'b', event_title: 'Featured', featured: true });
    expect(pickNextEngagement({ upcoming: [next, featured] })).toBe(featured);
    expect(pickNextEngagement({ upcoming: [next] })).toBe(next);
  });

  it('never promotes an invitation, a postponement or a cancellation', () => {
    expect(pickNextEngagement({
      upcoming: [
        engagement({ participation_status: 'invited', featured: true }),
        engagement({ event_status: 'postponed' }),
        engagement({ event_status: 'cancelled' }),
      ],
    })).toBeNull();
    expect(pickNextEngagement({})).toBeNull();
  });

  it('features the one next engagement, with its details and the ways on', async () => {
    mocks.fetchEngagements.mockResolvedValue({
      upcoming: [
        engagement({ id: 'a', event_title: 'Lab Forum', start_date: '2099-01-05' }),
        engagement({
          id: 'b', event_title: 'Annual Summit', featured: true, event_type: 'summit', roles: ['keynote_speaker'],
          start_date: '2099-02-10', end_date: '2099-02-11', city: 'Lusaka', country: 'Zambia', venue: 'Main Hall',
          session_title: 'Leading quality', image_url: 'https://cdn.example.org/summit.jpg', image_alt: 'Mutale speaking',
        }),
        engagement({ id: 'c', event_title: 'Webinar', start_date: '2099-03-01' }),
      ],
      tba: [engagement({ id: 't', event_title: 'Undated', dates_tbc: true, start_date: null, section: 'tba' })],
    });
    render(
      <MemoryRouter>
        <NextSpeakingEngagement eyebrow="Speaking" title="Next Speaking Engagement" linkLabel="View more upcoming engagements" />
      </MemoryRouter>,
    );
    const feature = within(await screen.findByRole('region', { name: 'Next Speaking Engagement' }));
    // The section's name, then the engagement as the headline.
    expect(feature.getByRole('heading', { level: 2, name: 'Next Speaking Engagement' })).toBeInTheDocument();
    expect(feature.getByRole('heading', { level: 3, name: 'Annual Summit' })).toBeInTheDocument();
    expect(feature.queryByText('Lab Forum')).not.toBeInTheDocument();

    expect(feature.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['10–11 February 2099', 'Lusaka, Zambia', 'Keynote speaker']);
    expect(feature.getByText('Leading quality')).toBeInTheDocument();
    expect(feature.getByText('Summit')).toBeInTheDocument();
    // "Confirmed" goes without saying here: only confirmed engagements are featured.
    expect(feature.queryByText('Confirmed')).not.toBeInTheDocument();
    expect(feature.getByRole('img', { name: 'Mutale speaking' })).toHaveAttribute('src', 'https://cdn.example.org/summit.jpg');

    expect(feature.getByRole('link', { name: 'View details: Annual Summit' })).toHaveAttribute('href', '/speaking/b');
    // Counts the others on the Speaking page (dated, upcoming), not the undated one.
    const more = feature.getByRole('link', { name: 'View more upcoming engagements 2 more' });
    expect(more).toHaveAttribute('href', '/speaking');
  });

  it('shows the event-type panel instead of a missing photo, and no count when nothing else is coming', async () => {
    mocks.fetchEngagements.mockResolvedValue({ upcoming: [engagement({ event_title: 'Solo Talk', image_url: 'https://cdn.example.org/missing.jpg', image_alt: 'Mutale at the podium' })] });
    const { container } = render(
      <MemoryRouter><NextSpeakingEngagement title="Next Speaking Engagement" linkLabel="View more upcoming engagements" /></MemoryRouter>,
    );
    fireEvent.error(await screen.findByRole('img', { name: 'Mutale at the podium' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="from-navy-950 via"] svg')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View more upcoming engagements' })).toHaveAttribute('href', '/speaking');
  });

  it('shows nothing when no confirmed engagement is coming up', async () => {
    mocks.fetchEngagements.mockResolvedValue({ upcoming: [engagement({ participation_status: 'invited' })] });
    const { container } = render(<MemoryRouter><NextSpeakingEngagement title="Next" /></MemoryRouter>);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('counts down in the event’s own time zone', () => {
    // 6 November 2026, 23:30 in Lusaka (21:30 UTC).
    const now = new Date('2026-11-06T21:30:00Z');
    const on = (start_date, extra = {}) => countdownLabel(engagement({ start_date, timezone: 'Africa/Lusaka', ...extra }), now);
    expect(on('2026-11-06')).toBe('Today');
    expect(on('2026-11-07')).toBe('Tomorrow');
    expect(on('2026-11-26')).toBe('In 20 days');
    expect(on('2026-11-06', { in_progress: true })).toBe('Happening now');
    // Too far off to be worth counting, undated, or already past.
    expect(on('2027-06-01')).toBe('');
    expect(on(null, { dates_tbc: true })).toBe('');
    expect(on('2026-11-01')).toBe('');
    // Already the 7th in Lusaka, though still the 6th in Honolulu.
    expect(countdownLabel(engagement({ start_date: '2026-11-07', timezone: 'Pacific/Honolulu' }), new Date('2026-11-06T22:30:00Z'))).toBe('Tomorrow');
    expect(countdownLabel(engagement({ start_date: '2026-11-07', timezone: 'Africa/Lusaka' }), new Date('2026-11-06T22:30:00Z'))).toBe('Today');
  });
});

describe('trackSpeaking', () => {
  it('sends nothing until the visitor accepts analytics cookies', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    trackSpeaking('profile_download');
    expect(fetchSpy).not.toHaveBeenCalled();

    mocks.consent = true;
    trackSpeaking('event_website_click', 'spk-1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/speaking\/metrics$/);
    expect(options).toMatchObject({ method: 'POST', keepalive: true });
    expect(JSON.parse(options.body)).toEqual({ metric: 'event_website_click', engagement_id: 'spk-1' });
  });

  it('never throws when counting fails', () => {
    mocks.consent = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('offline'); });
    expect(() => trackSpeaking('profile_download')).not.toThrow();
  });
});

describe('speaking API errors', () => {
  // The module is mocked for the homepage band above; these need the real one.
  const api = () => vi.importActual('../utils/speakingApi');
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('turns a lost connection into a plain message instead of “Failed to fetch”', async () => {
    const { fetchEnquiryToken, submitSpeakingEnquiry } = await api();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const message = 'We couldn’t reach the server. Check your connection and try again.';
    await expect(fetchEnquiryToken()).rejects.toThrow(message);
    await expect(submitSpeakingEnquiry({})).rejects.toThrow(message);
  });

  it('marks a turned-away token so the form can replace it, but not field errors or other failures', async () => {
    const { submitSpeakingEnquiry } = await api();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce(reply(400, { ok: false, message: 'This form has expired. Please press Send again.' }));
    await expect(submitSpeakingEnquiry({})).rejects.toMatchObject({
      message: 'This form has expired. Please press Send again.', tokenRejected: true,
    });

    fetchSpy.mockResolvedValueOnce(reply(400, { ok: false, message: 'Please fix the highlighted fields.', errors: { email: 'Enter a valid email address.' } }));
    await expect(submitSpeakingEnquiry({})).rejects.toMatchObject({
      tokenRejected: false, fieldErrors: { email: 'Enter a valid email address.' },
    });

    fetchSpy.mockResolvedValueOnce(reply(500, { ok: false, message: 'Your enquiry could not be sent. Please try again.' }));
    await expect(submitSpeakingEnquiry({})).rejects.toMatchObject({ tokenRejected: false });
  });
});

describe('filter rules', () => {
  const groups = {
    upcoming: [engagement({ id: 'u', start_date: '2099-03-01', roles: ['moderator'], topics: ['Upcoming only'] })],
    tba: [engagement({ id: 't', start_date: null, roles: ['trainer'], section: 'tba' })],
    previous: [
      engagement({ id: 'p1', start_date: '2025-12-30', end_date: '2026-01-02', roles: ['panellist'], topics: ['Quality'] }),
      engagement({ id: 'p2', start_date: '2024-03-01', roles: ['keynote_speaker', 'speaker'], topics: ['quality', 'Growth'] }),
    ],
    cancelled: [engagement({ id: 'c', start_date: '2023-05-01', roles: ['speaker'], event_status: 'cancelled', section: 'cancelled' })],
  };
  const pastIds = (filtered) => [...filtered.previous, ...filtered.cancelled].map((e) => e.id);

  it('offers only the years, roles and topics that occur in past engagements', () => {
    const options = filterOptions(groups);
    expect(options.total).toBe(3);
    expect(options.years).toEqual(['2026', '2025', '2024', '2023']);
    expect(options.roles.map((r) => r.value)).toEqual(['keynote_speaker', 'speaker', 'panellist']);
    expect(options.topics).toEqual(['Growth', 'Quality']);
  });

  it('matches an event in every year it spans, and topics regardless of case', () => {
    expect(pastIds(applyFilters(groups, { year: '2026', role: '', topic: '' }))).toEqual(['p1']);
    expect(pastIds(applyFilters(groups, { year: '2025', role: '', topic: '' }))).toEqual(['p1']);
    expect(pastIds(applyFilters(groups, { year: '', role: 'speaker', topic: '' }))).toEqual(['p2', 'c']);
    expect(pastIds(applyFilters(groups, { year: '', role: '', topic: 'QUALITY' }))).toEqual(['p1', 'p2']);
  });

  it('leaves upcoming and undated engagements in full', () => {
    const filtered = applyFilters(groups, { year: '2024', role: 'speaker', topic: 'Growth' });
    expect(filtered.upcoming).toBe(groups.upcoming);
    expect(filtered.tba).toBe(groups.tba);
    expect(pastIds(filtered)).toEqual(['p2']);
  });
});

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open preview</button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Preview" footer={<button type="button">Save</button>}>
          <a href="#x">First link</a>
        </Modal>
      </>
    );
  }

  it('is a labelled dialog that takes focus, keeps Tab inside, closes on Escape and returns focus', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open preview' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Preview' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();

    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
