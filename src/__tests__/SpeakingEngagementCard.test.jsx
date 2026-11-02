import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SpeakingEngagementCard from '../components/speaking/SpeakingEngagementCard';
import { engagementBadges } from '../components/speaking/engagementBadges';
import { previewEngagement } from '../../shared/speakingEngagements.js';

const BASE = {
  id: 'spk-1',
  event_title: 'BMSZ2026 Scientific Conference',
  organiser: 'Biomedical Society of Zambia',
  event_type: 'conference',
  roles: ['speaker', 'facilitator'],
  session_title: 'Laboratory systems and health security',
  description: 'Speaking and facilitating sessions on laboratory systems.',
  start_date: '2099-12-02',
  end_date: '2099-12-03',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  city: 'Livingstone',
  country: 'Zambia',
  audience_access: 'public',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
};

// No "Add to calendar" (invited) and no media: just the card itself.
const PLAIN = { ...BASE, participation_status: 'invited' };

const ARROW = '.lucide-arrow-up-right';
// What a sighted visitor sees, leaving out the date tile and other decorative copies.
const VISIBLE = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };

describe('SpeakingEngagementCard — with an event website', () => {
  it('is a native link to the event site, opening in a new tab safely, named after the event', () => {
    render(<SpeakingEngagementCard engagement={{ ...BASE, event_url: 'https://bmsz.org/conference' }} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://bmsz.org/conference');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link).toHaveAccessibleName('BMSZ2026 Scientific Conference — event website (opens in a new tab)');
    expect(screen.getByText('Event website')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-linked', 'true');
  });

  it('shows the arrow, lets clicks on the label fall through to the link, and keeps focus visible in forced colours', () => {
    const { container } = render(<SpeakingEngagementCard engagement={{ ...PLAIN, event_url: 'https://bmsz.org' }} />);
    expect(container.querySelector(ARROW)).not.toBeNull();
    // jsdom can't hit-test; the label must not swallow clicks meant for the stretched link.
    expect(screen.getByText('Event website')).toHaveClass('pointer-events-none');
    // outline-none would leave nothing at all once forced colours drop the ring.
    expect(screen.getByRole('link')).toHaveClass('focus:outline-hidden');
    expect(screen.getByRole('link').className).not.toMatch(/outline-none/);
  });

  it('has exactly one link and nothing else focusable, so links never nest', () => {
    const { container } = render(<SpeakingEngagementCard engagement={{ ...PLAIN, event_url: 'https://bmsz.org' }} />);
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelectorAll('button, [tabindex], [role="link"]')).toHaveLength(0);
  });
});

describe('SpeakingEngagementCard — without an event website', () => {
  it('is not clickable or focusable and shows no link indicators', () => {
    const { container } = render(<SpeakingEngagementCard engagement={{ ...PLAIN, event_url: null }} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a, button, [tabindex], [role="link"]')).toHaveLength(0);
    expect(screen.queryByText('Event website')).not.toBeInTheDocument();
    expect(container.querySelector(ARROW)).toBeNull();
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('data-linked', 'false');
    expect(article.className).not.toMatch(/hover:|cursor-pointer|focus-within/);
  });

  it('treats an unsafe URL as no URL', () => {
    render(<SpeakingEngagementCard engagement={{ ...BASE, event_url: 'javascript:alert(1)' }} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // Brief §10 item 5: the same card, re-rendered without its URL.
  it('drops every link behaviour and indicator as soon as the URL is removed', () => {
    const { rerender, container } = render(<SpeakingEngagementCard engagement={{ ...PLAIN, event_url: 'https://bmsz.org' }} />);
    const article = screen.getByRole('article');
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(container.querySelector(ARROW)).not.toBeNull();
    expect(article.className).toMatch(/hover:/);

    rerender(<SpeakingEngagementCard engagement={{ ...PLAIN, event_url: '' }} />);
    expect(screen.getByRole('article')).toBe(article);
    expect(container.querySelectorAll('a, button, [tabindex], [role="link"]')).toHaveLength(0);
    expect(container.querySelector('.card-link')).toBeNull();
    expect(screen.queryByText('Event website')).not.toBeInTheDocument();
    expect(container.querySelector(ARROW)).toBeNull();
    expect(article).toHaveAttribute('data-linked', 'false');
    expect(article.className).not.toMatch(/hover:|cursor-pointer|focus-within|has-\[/);
  });
});

describe('SpeakingEngagementCard — separate actions', () => {
  const MEDIA = [
    { type: 'recording', url: 'https://video.example.org/talk', label: null },
    { type: 'slides', url: 'https://example.org/slides.pdf', label: 'Download the slides' },
    { type: 'article', url: 'javascript:alert(1)', label: null },
  ];

  it('keeps recordings and slides outside the card link, opening safely in a new tab', () => {
    const { container } = render(
      <SpeakingEngagementCard engagement={{ ...PLAIN, event_url: 'https://bmsz.org', media: MEDIA }} />,
    );
    const cardLink = screen.getByRole('link', { name: /event website/ });
    const recording = screen.getByRole('link', { name: 'Watch recording: BMSZ2026 Scientific Conference (opens in a new tab)' });
    const slides = screen.getByRole('link', { name: /^Download the slides: / });
    for (const action of [recording, slides]) {
      expect(cardLink.contains(action)).toBe(false);
      expect(action).toHaveAttribute('target', '_blank');
      expect(action.getAttribute('rel')).toContain('noopener');
    }
    expect(recording).toHaveAttribute('href', 'https://video.example.org/talk');
    // The unsafe article link is dropped, not rendered as a dead link.
    expect(container.querySelectorAll('a')).toHaveLength(3);
  });

  it('never makes a card without an event website clickable', () => {
    const { container } = render(<SpeakingEngagementCard engagement={{ ...BASE, event_url: null, media: MEDIA.slice(0, 1) }} />);
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('data-linked', 'false');
    expect(screen.queryByText('Event website')).not.toBeInTheDocument();
    // Only the clearly labelled actions can be focused; the card itself cannot.
    const focusable = [...container.querySelectorAll('a, button, [tabindex]')];
    expect(focusable.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Watch recording: BMSZ2026 Scientific Conference (opens in a new tab)',
      'Add to calendar: BMSZ2026 Scientific Conference',
    ]);
    expect(article.className).not.toMatch(/hover:|cursor-pointer/);
  });

  it('offers Add to calendar only for confirmed, scheduled, upcoming engagements', () => {
    const { rerender } = render(<SpeakingEngagementCard engagement={BASE} />);
    expect(screen.getByRole('button', { name: /^Add to calendar:/ })).toBeInTheDocument();
    for (const change of [
      { participation_status: 'invited' },
      { event_status: 'postponed' },
      { event_status: 'cancelled' },
      { section: 'previous' },
      { dates_tbc: true, start_date: null, end_date: null, section: 'tba' },
    ]) {
      rerender(<SpeakingEngagementCard engagement={{ ...BASE, ...change }} />);
      expect(screen.queryByRole('button', { name: /^Add to calendar:/ })).not.toBeInTheDocument();
    }
  });

  it('lists topics when they are set', () => {
    render(<SpeakingEngagementCard engagement={{ ...PLAIN, topics: ['Leadership', 'Quality systems'] }} />);
    expect(screen.getByText('Leadership · Quality systems')).toBeInTheDocument();
  });
});

describe('SpeakingEngagementCard — content', () => {
  it('shows date, title, location, roles, session, organiser, and description', () => {
    render(<SpeakingEngagementCard engagement={BASE} />);
    const card = within(screen.getByRole('article'));
    expect(card.getByText('02–03')).toBeInTheDocument();
    expect(card.getByText('Dec 2099')).toBeInTheDocument();
    expect(card.getByText('2–3 December 2099')).toBeInTheDocument();
    expect(card.getByRole('heading', { name: 'BMSZ2026 Scientific Conference' })).toBeInTheDocument();
    expect(card.getByText('Livingstone, Zambia')).toBeInTheDocument();
    expect(card.getByText('Speaker · Facilitator')).toBeInTheDocument();
    expect(card.getByText('Laboratory systems and health security')).toBeInTheDocument();
    expect(card.getByText('Organised by Biomedical Society of Zambia')).toBeInTheDocument();
  });

  it('omits empty optional fields cleanly — no blank rows, placeholders, or "null"', () => {
    const { container } = render(
      <SpeakingEngagementCard engagement={{
        id: 'x', event_title: 'Minimal', roles: [], start_date: null, dates_tbc: false,
        audience_access: 'unspecified', participation_status: 'invited', event_status: 'scheduled', section: 'tba',
      }}
      />,
    );
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(container.querySelectorAll('li')).toHaveLength(0);
    // No empty list for screen readers to announce as "list, 0 items".
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByText('Date to be announced')).toBeInTheDocument();
  });

  it('shows "Online" for online events', () => {
    render(<SpeakingEngagementCard engagement={{ ...BASE, attendance_format: 'online', city: null, country: null }} />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('keeps the roles and session title apart for screen readers', () => {
    render(<SpeakingEngagementCard engagement={BASE} />);
    const line = screen.getByText('Speaker · Facilitator').parentElement;
    const spoken = line.cloneNode(true);
    spoken.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
    expect(spoken.textContent.replace(/\s+/g, ' ')).toBe('Speaker · Facilitator Laboratory systems and health security');
  });

  it('lets long unbroken text wrap inside the card', () => {
    const link = 'https://us02web.zoom.us/j/81234567890?pwd=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    render(<SpeakingEngagementCard engagement={{ ...PLAIN, description: `Join online: ${link}` }} />);
    // jsdom has no layout, so this checks the wrapping rule is on the text's column.
    expect(screen.getByText(`Join online: ${link}`).closest('.wrap-anywhere')).not.toBeNull();
  });
});

// Brief §10 item 7, on rendered cards in every section they can appear in.
describe('SpeakingEngagementCard — postponed and cancelled labels', () => {
  const PAST = { start_date: '2020-05-01', end_date: null };
  const UNDATED = { start_date: null, end_date: null, dates_tbc: true };
  const CASES = [
    ['upcoming', 'postponed', {}],
    ['upcoming', 'cancelled', {}],
    ['tba', 'postponed', UNDATED],
    ['tba', 'cancelled', UNDATED],
    ['previous', 'postponed', PAST],
    ['previous', 'cancelled', PAST],
    ['cancelled', 'cancelled', PAST],
  ];

  it.each(CASES)('labels a card in “%s” as %s', (section, status, dates) => {
    render(<SpeakingEngagementCard engagement={{ ...BASE, ...dates, section, event_status: status }} />);
    const card = within(screen.getByRole('article'));
    const label = status === 'cancelled' ? 'Cancelled' : 'Postponed';
    expect(card.getByText(label, VISIBLE)).toBeInTheDocument();
    expect(card.queryByText('Happening now')).not.toBeInTheDocument();
    const past = section === 'previous' || section === 'cancelled';
    if (status === 'cancelled' || past) expect(card.queryByText('Confirmed')).not.toBeInTheDocument();
  });

  it('never promises a date for an undated cancellation', () => {
    render(<SpeakingEngagementCard engagement={{ ...BASE, ...UNDATED, section: 'tba', event_status: 'cancelled' }} />);
    const article = screen.getByRole('article');
    expect(article.textContent).not.toMatch(/to be announced/i);
    expect(within(article).getByText('Cancelled', VISIBLE)).toBeInTheDocument();
  });

  it('keeps “Invited” on a past card, so it never reads as a talk given', () => {
    render(<SpeakingEngagementCard engagement={{ ...PLAIN, ...PAST, section: 'previous' }} />);
    const card = within(screen.getByRole('article'));
    expect(card.getByText('Invited')).toBeInTheDocument();
    expect(card.queryByText('Confirmed')).not.toBeInTheDocument();
  });
});

describe('engagementBadges', () => {
  const labels = (engagement) => engagementBadges(engagement).map((b) => b.label);

  it('labels confirmed and invited upcoming engagements in text', () => {
    expect(labels(BASE)).toEqual(['Confirmed', 'Open to the public']);
    expect(labels({ ...BASE, participation_status: 'invited', audience_access: 'invitation_only' }))
      .toEqual(['Invited', 'Invitation only']);
  });

  it('never presents a cancelled engagement as confirmed', () => {
    expect(labels({ ...BASE, event_status: 'cancelled' })).toEqual(['Cancelled', 'Open to the public']);
    expect(labels({ ...BASE, event_status: 'cancelled', section: 'previous' })).not.toContain('Confirmed');
  });

  it('keeps the postponed label visible', () => {
    expect(labels({ ...BASE, event_status: 'postponed' })).toContain('Postponed');
  });

  it('marks an engagement in progress', () => {
    expect(labels({ ...BASE, in_progress: true })[0]).toBe('Happening now');
  });

  it('drops “Confirmed” from past engagements but keeps “Invited”, which never implies confirmation', () => {
    expect(labels({ ...BASE, section: 'previous' })).toEqual(['Open to the public']);
    expect(labels({ ...BASE, section: 'previous', participation_status: 'invited' }))
      .toEqual(['Invited', 'Open to the public']);
    expect(labels({ ...BASE, section: 'cancelled', event_status: 'cancelled', participation_status: 'invited' }))
      .toEqual(['Cancelled', 'Invited', 'Open to the public']);
  });
});

describe('previewEngagement', () => {
  it('previews admin form values with the same whitelist as the public API', () => {
    const preview = previewEngagement({
      ...BASE, event_url: 'https://bmsz.org', admin_notes: 'PRIVATE', start_date: '2099-12-02',
    });
    expect(preview).not.toHaveProperty('admin_notes');
    expect(preview.event_url).toBe('https://bmsz.org/');
    expect(preview.section).toBe('upcoming');
  });

  it('previews an invalid URL as no link, matching what would be saved', () => {
    expect(previewEngagement({ event_title: 'A', event_url: 'ftp://x' }).event_url).toBeNull();
  });
});
