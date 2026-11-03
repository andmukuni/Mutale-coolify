import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  session_date: '2099-12-02',
  session_start_time: '09:00:00',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  venue: 'Radisson Blu Mosi Oa Tunya',
  city: 'Livingstone',
  country: 'Zambia',
  audience_access: 'public',
  event_url: 'https://bmsz.org/conference',
  topics: ['Leadership'],
  media: [{ type: 'recording', url: 'https://video.example.org/talk', label: null }],
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
};

// What a sighted visitor sees, leaving out the date leaf and other decorative copies.
const VISIBLE = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };

const renderCard = (engagement, props = {}) => render(
  <MemoryRouter><SpeakingEngagementCard engagement={engagement} {...props} /></MemoryRouter>,
);

describe('SpeakingEngagementCard — link to the engagement’s page', () => {
  it('is one link to the engagement’s own page, named after the event', () => {
    const { container } = renderCard(BASE);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/speaking/spk-1');
    expect(link).toHaveAccessibleName('BMSZ2026 Scientific Conference');
    // It stays on this site, in the same tab.
    expect(link).not.toHaveAttribute('target');
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(1);
    expect(screen.getByRole('article')).toHaveAttribute('data-linked', 'true');
    expect(screen.getByText('View details')).toBeInTheDocument();
  });

  it('opens the page whether or not the event has a website', () => {
    renderCard({ ...BASE, event_url: null, media: [] });
    expect(screen.getByRole('link', { name: 'BMSZ2026 Scientific Conference' })).toHaveAttribute('href', '/speaking/spk-1');
  });

  it('stretches the link over the card and keeps focus visible in forced colours', () => {
    renderCard(BASE);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('card-link', 'after:absolute', 'after:inset-0');
    // outline-none would leave nothing at all once forced colours drop the ring.
    expect(link).toHaveClass('focus:outline-hidden');
    expect(link.className).not.toMatch(/outline-none/);
  });

  it('is a plain card with nothing to click where there is no page to open, such as an admin preview', () => {
    const { container } = renderCard(BASE, { linked: false });
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(0);
    expect(screen.queryByText('View details')).not.toBeInTheDocument();
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('data-linked', 'false');
    expect(article.className).not.toMatch(/hover:|has-\[/);
  });

  it('escapes the id in the page address', () => {
    renderCard({ ...BASE, id: 'spk 1/2' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/speaking/spk%201%2F2');
  });
});

describe('SpeakingEngagementCard — content', () => {
  it('shows the date, type, title, role and place', () => {
    renderCard(BASE);
    const card = within(screen.getByRole('article'));
    // The calendar leaf, for sighted visitors…
    expect(card.getByText('Dec')).toBeInTheDocument();
    expect(card.getByText('02–03')).toBeInTheDocument();
    expect(card.getByText('2099')).toBeInTheDocument();
    // …and the dates in full for screen readers, which skip the leaf.
    expect(card.getByText('2–3 December 2099')).toHaveClass('sr-only');
    expect(card.getByText('Conference')).toBeInTheDocument();
    expect(card.getByRole('heading', { name: 'BMSZ2026 Scientific Conference' })).toBeInTheDocument();
    expect(card.getByText('Speaker · Facilitator')).toBeInTheDocument();
    // City and country only; the venue is on the page.
    expect(card.getByText('Livingstone, Zambia')).toBeInTheDocument();
  });

  it('leaves everything else for the engagement’s page', () => {
    renderCard(BASE);
    const card = within(screen.getByRole('article'));
    for (const text of [
      /Radisson Blu/,
      /Biomedical Society of Zambia/,
      /Laboratory systems and health security/,
      /Speaking and facilitating/,
      /Leadership/,
      /Event website/,
      /Add to calendar/,
      /Watch recording/,
    ]) {
      expect(card.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it('omits empty optional fields cleanly — no blank rows, placeholders, or "null"', () => {
    const { container } = renderCard({
      id: 'x', event_title: 'Minimal', roles: [], start_date: null, dates_tbc: false,
      audience_access: 'unspecified', participation_status: 'invited', event_status: 'scheduled', section: 'tba',
    });
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(container.querySelectorAll('img, ul, li')).toHaveLength(0);
    expect(screen.getByText('TBA')).toBeInTheDocument();
    expect(screen.getByText('Dates to be announced')).toHaveClass('sr-only');
  });

  it('shows "Online" for online events', () => {
    renderCard({ ...BASE, attendance_format: 'online', city: null, country: null });
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('keeps the role and place apart for screen readers', () => {
    renderCard(BASE);
    const line = screen.getByText('Speaker · Facilitator').parentElement;
    const spoken = line.cloneNode(true);
    spoken.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
    expect(spoken.textContent.replace(/\s+/g, ' ')).toBe('Speaker · Facilitator Livingstone, Zambia');
  });

  it('shows the photo with its description', () => {
    renderCard({ ...BASE, image_url: 'https://cdn.example.org/mutale.jpg', image_alt: 'Mutale Mubanga speaking' });
    expect(screen.getByRole('img', { name: 'Mutale Mubanga speaking' })).toHaveAttribute('src', 'https://cdn.example.org/mutale.jpg');
  });

  it('lets long unbroken text wrap inside the card', () => {
    const title = 'International-Conference-on-Laboratory-Quality-Management-Systems-and-Accreditation-2027';
    renderCard({ ...BASE, event_title: title });
    // jsdom has no layout, so this checks the wrapping rule is on the text's column.
    expect(screen.getByRole('heading', { name: title }).closest('.wrap-anywhere')).not.toBeNull();
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
    renderCard({ ...BASE, ...dates, section, event_status: status });
    const card = within(screen.getByRole('article'));
    const label = status === 'cancelled' ? 'Cancelled' : 'Postponed';
    expect(card.getByText(label, VISIBLE)).toBeInTheDocument();
    expect(card.queryByText('Happening now')).not.toBeInTheDocument();
    const past = section === 'previous' || section === 'cancelled';
    if (status === 'cancelled' || past) expect(card.queryByText('Confirmed')).not.toBeInTheDocument();
  });

  it('never promises a date for an undated cancellation', () => {
    renderCard({ ...BASE, ...UNDATED, section: 'tba', event_status: 'cancelled' });
    const article = screen.getByRole('article');
    expect(article.textContent).not.toMatch(/to be announced/i);
    expect(within(article).getByText('Cancelled', VISIBLE)).toBeInTheDocument();
  });

  it('keeps “Invited” on a past card, so it never reads as a talk given', () => {
    renderCard({ ...BASE, ...PAST, participation_status: 'invited', section: 'previous' });
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
