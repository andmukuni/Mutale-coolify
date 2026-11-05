import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EngagementGridCard from '../components/speaking/EngagementGridCard';
import { listingBadges, pastBadges } from '../components/speaking/engagementBadges';

const BASE = {
  id: 'spk-1',
  event_title: 'Zambia Laboratory Leadership Summit',
  organiser: 'Laboratory Leaders Network',
  event_type: 'summit',
  roles: ['keynote_speaker'],
  session_title: 'Leading quality',
  description: 'A two-day summit for laboratory managers.',
  start_date: '2099-11-26',
  end_date: '2099-11-27',
  timezone: 'Africa/Lusaka',
  attendance_format: 'in_person',
  venue: 'Mulungushi International Conference Centre',
  city: 'Lusaka',
  country: 'Zambia',
  audience_access: 'public',
  event_url: 'https://example.org/summit',
  topics: ['Leadership'],
  media: [],
  participation_status: 'confirmed',
  event_status: 'scheduled',
  section: 'upcoming',
  in_progress: false,
};

// What a sighted visitor sees, leaving out the decorative date.
const VISIBLE = { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' };

const renderCard = (engagement, props = {}) => render(
  <MemoryRouter><EngagementGridCard engagement={engagement} {...props} /></MemoryRouter>,
);

describe('EngagementGridCard — link', () => {
  it('is one link to the engagement’s page, named after the event, over the whole card', () => {
    const { container } = renderCard(BASE);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/speaking/spk-1');
    expect(link).toHaveAccessibleName('Zambia Laboratory Leadership Summit');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveClass('card-link', 'after:absolute', 'after:inset-0', 'focus:outline-hidden');
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(1);
    expect(screen.getByText('View details')).toBeInTheDocument();
  });

  it('is a plain card where there is no page to open, such as an admin preview', () => {
    const { container } = renderCard(BASE, { linked: false });
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(0);
    expect(screen.queryByText('View details')).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-linked', 'false');
    expect(screen.getByRole('article').className).not.toMatch(/hover:|has-\[/);
  });
});

describe('EngagementGridCard — content', () => {
  it('shows the date on a badge over the top of the card, and in full to screen readers', () => {
    renderCard(BASE);
    const card = within(screen.getByRole('article'));
    const badge = card.getByText('26–27').parentElement;
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(within(badge).getByText('Nov')).toBeInTheDocument();
    expect(within(badge).getByText('2099')).toBeInTheDocument();
    // It sits above the stretched link, so it must let clicks through to it.
    expect(badge).toHaveClass('pointer-events-none');
    expect(card.getByText('26–27 November 2099')).toHaveClass('sr-only');
  });

  it('shows a panel with an icon for the kind of event when there is no photo', () => {
    const { container } = renderCard(BASE);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const panel = container.querySelector('[class*="from-navy-950"]');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.querySelector('svg')).not.toBeNull();
  });

  it('shows the photo with its description, with the same date badge', () => {
    const { container } = renderCard({ ...BASE, image_url: 'https://cdn.example.org/mutale.jpg', image_alt: 'Mutale Mubanga speaking' });
    expect(screen.getByRole('img', { name: 'Mutale Mubanga speaking' })).toHaveAttribute('src', 'https://cdn.example.org/mutale.jpg');
    expect(screen.getByText('26–27').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[class*="from-navy-950 via"]')).toBeNull();
  });

  it('falls back to the icon panel when the photo fails to load, keeping the date', () => {
    const { container } = renderCard({ ...BASE, image_url: 'https://cdn.example.org/missing.jpg', image_alt: 'Mutale Mubanga speaking' });
    fireEvent.error(screen.getByRole('img', { name: 'Mutale Mubanga speaking' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="from-navy-950 via"]')).not.toBeNull();
    expect(within(screen.getByText('26–27').parentElement).getByText('Nov')).toBeInTheDocument();
    expect(screen.getByText('26–27 November 2099')).toHaveClass('sr-only');
  });

  it('says the dates are to be announced when they are', () => {
    renderCard({ ...BASE, start_date: null, end_date: null, dates_tbc: true, section: 'tba' });
    const badge = screen.getByText('TBA').parentElement;
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(within(badge).getByText('Dates')).toBeInTheDocument();
  });

  it('shows the type, title, role and city, and leaves the rest to the engagement’s page', () => {
    renderCard(BASE);
    const card = within(screen.getByRole('article'));
    expect(card.getByText('Summit')).toBeInTheDocument();
    expect(card.getByRole('heading', { level: 3, name: 'Zambia Laboratory Leadership Summit' })).toBeInTheDocument();
    expect(card.getByText('Keynote speaker')).toBeInTheDocument();
    expect(card.getByText('Lusaka, Zambia')).toBeInTheDocument();
    for (const text of [/Mulungushi/, /Laboratory Leaders Network/, /Leading quality/, /two-day summit/, /Leadership$/, /Event website/]) {
      expect(card.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it('never promises a date for an undated cancellation', () => {
    renderCard({ ...BASE, start_date: null, end_date: null, dates_tbc: true, event_status: 'cancelled', section: 'tba' });
    const article = screen.getByRole('article');
    expect(article.textContent).not.toMatch(/to be announced/i);
    expect(within(article).getByText('Cancelled', VISIBLE)).toBeInTheDocument();
  });

  it('omits empty optional fields cleanly', () => {
    const { container } = renderCard({
      id: 'x', event_title: 'Minimal', roles: [], start_date: '2099-05-01', audience_access: 'unspecified',
      participation_status: 'confirmed', event_status: 'scheduled', section: 'upcoming',
    });
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(container.querySelectorAll('img, ul, li')).toHaveLength(0);
  });

  it('lets long unbroken titles wrap inside the card', () => {
    const title = 'International-Conference-on-Laboratory-Quality-Management-Systems-and-Accreditation-2027';
    renderCard({ ...BASE, event_title: title });
    expect(screen.getByRole('heading', { name: title }).closest('.wrap-anywhere')).not.toBeNull();
  });
});

// Brief §10 item 7 on the grid card.
describe('EngagementGridCard — labels', () => {
  it.each([
    ['postponed', 'Postponed'],
    ['cancelled', 'Cancelled'],
  ])('labels a %s engagement, and never as confirmed', (status, label) => {
    renderCard({ ...BASE, event_status: status });
    const card = within(screen.getByRole('article'));
    expect(card.getByText(label, VISIBLE)).toBeInTheDocument();
    expect(card.queryByText('Confirmed')).not.toBeInTheDocument();
  });

  it('marks an engagement in progress', () => {
    renderCard({ ...BASE, in_progress: true });
    expect(screen.getByText('Happening now')).toBeInTheDocument();
  });

  it('keeps “Invited” and “Invitation only”, which set an engagement apart', () => {
    renderCard({ ...BASE, participation_status: 'invited', audience_access: 'invitation_only' });
    const card = within(screen.getByRole('article'));
    expect(card.getByText('Invited')).toBeInTheDocument();
    expect(card.getByText('Invitation only')).toBeInTheDocument();
  });
});

describe('listing labels', () => {
  const labels = (badges) => badges.map((b) => b.label);

  it('leave out “Confirmed” and “Open to the public”, which describe most engagements', () => {
    expect(labels(listingBadges(BASE))).toEqual([]);
    expect(labels(listingBadges({ ...BASE, participation_status: 'invited', audience_access: 'invitation_only' })))
      .toEqual(['Invited', 'Invitation only']);
    expect(labels(listingBadges({ ...BASE, event_status: 'postponed', in_progress: true })))
      .toEqual(['Happening now', 'Postponed']);
  });

  it('leave out who could attend once an engagement is over, but keep “Invited”', () => {
    const past = { ...BASE, section: 'previous', participation_status: 'invited', audience_access: 'invitation_only' };
    expect(labels(pastBadges(past))).toEqual(['Invited']);
    expect(labels(pastBadges({ ...past, section: 'cancelled', event_status: 'cancelled' }))).toEqual(['Cancelled', 'Invited']);
  });
});
