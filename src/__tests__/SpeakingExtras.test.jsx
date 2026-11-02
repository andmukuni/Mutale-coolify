import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';

const mocks = vi.hoisted(() => ({ fetchEngagements: vi.fn(), consent: false }));

vi.mock('../utils/speakingApi', () => ({ fetchPublicSpeakingEngagements: mocks.fetchEngagements }));
vi.mock('../utils/cookieConsent', () => ({ hasConsent: (category) => category === 'analytics' && mocks.consent }));

import NextSpeakingEngagement from '../components/speaking/NextSpeakingEngagement';
import { pickNextEngagement } from '../components/speaking/nextEngagement';
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

  it('shows the card with a link to the Speaking page, or nothing at all', async () => {
    mocks.fetchEngagements.mockResolvedValue({ upcoming: [engagement({ event_title: 'Annual Summit' })] });
    const { unmount } = render(
      <MemoryRouter>
        <NextSpeakingEngagement eyebrow="Speaking" title="Next Speaking Engagement" linkLabel="All speaking engagements" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Annual Summit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All speaking engagements/ })).toHaveAttribute('href', '/speaking');
    unmount();

    mocks.fetchEngagements.mockResolvedValue({ upcoming: [] });
    const { container } = render(<MemoryRouter><NextSpeakingEngagement title="Next" /></MemoryRouter>);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
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
    upcoming: [engagement({ id: 'u', start_date: '2026-12-30', end_date: '2027-01-02', roles: ['panellist'], topics: ['Quality'] })],
    tba: [engagement({ id: 't', start_date: null, roles: ['speaker'], section: 'tba' })],
    previous: [engagement({ id: 'p', start_date: '2025-03-01', roles: ['keynote_speaker', 'speaker'], topics: ['quality', 'Growth'] })],
    cancelled: [],
  };

  it('offers only the years, roles and topics that occur', () => {
    const options = filterOptions(groups);
    expect(options.total).toBe(3);
    expect(options.years).toEqual(['2027', '2026', '2025']);
    expect(options.roles.map((r) => r.value)).toEqual(['keynote_speaker', 'speaker', 'panellist']);
    expect(options.topics).toEqual(['Growth', 'Quality']);
  });

  it('matches an event in every year it spans, and leaves undated ones out of a year filter', () => {
    const ids = (filtered) => Object.values(filtered).flat().map((e) => e.id);
    expect(ids(applyFilters(groups, { year: '2027', role: '', topic: '' }))).toEqual(['u']);
    expect(ids(applyFilters(groups, { year: '', role: 'speaker', topic: '' }))).toEqual(['t', 'p']);
    expect(ids(applyFilters(groups, { year: '', role: '', topic: 'QUALITY' }))).toEqual(['u', 'p']);
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
