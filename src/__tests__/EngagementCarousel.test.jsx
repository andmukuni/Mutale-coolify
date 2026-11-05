import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EngagementCarousel from '../components/speaking/EngagementCarousel';

const engagement = (n) => ({
  id: `spk-${n}`,
  event_title: `Engagement ${String.fromCharCode(64 + n)}`,
  event_type: 'conference',
  roles: ['speaker'],
  start_date: `2099-0${n}-10`,
  timezone: 'Africa/Lusaka',
  audience_access: 'public',
  participation_status: 'confirmed',
  event_status: 'scheduled',
  dates_tbc: false,
  in_progress: false,
  section: 'upcoming',
});
const several = (count) => Array.from({ length: count }, (_, i) => engagement(i + 1));

function renderCarousel(engagements) {
  const view = render(<MemoryRouter><EngagementCarousel engagements={engagements} /></MemoryRouter>);
  const carousel = screen.getByRole('group', { name: 'Upcoming engagements' });
  const track = within(carousel).getByRole('list');
  return { ...view, carousel, track };
}

/** jsdom has no layout, so give the track and its cards the sizes a browser would. */
function layOut(track, { cardWidth, trackWidth }) {
  [...track.children].forEach((slide, i) => {
    Object.defineProperty(slide, 'offsetWidth', { configurable: true, value: cardWidth });
    Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: i * cardWidth });
  });
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: trackWidth });
  fireEvent(window, new Event('resize'));
}

const status = (carousel) => carousel.querySelector('[aria-live="polite"]');
const dots = () => within(screen.getByRole('group', { name: 'Choose engagements to show' })).getAllByRole('button');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EngagementCarousel', () => {
  it('is a carousel of cards, each one link to its engagement’s page', () => {
    const { carousel, track } = renderCarousel(several(3));
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    expect(within(track).getAllByRole('listitem')).toHaveLength(3);
    expect(within(track).getByRole('link', { name: 'Engagement B' })).toHaveAttribute('href', '/speaking/spk-2');
    expect(within(track).getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });

  it('shows no controls when every card fits', () => {
    const { carousel } = renderCarousel(several(1));
    expect(within(carousel).queryByRole('button')).not.toBeInTheDocument();
    expect(status(carousel)).toHaveTextContent('');
  });

  it('moves with the arrows, which stop at either end', () => {
    const { carousel } = renderCarousel(several(3));
    const previous = screen.getByRole('button', { name: 'Previous engagement' });
    const next = screen.getByRole('button', { name: 'Next engagement' });

    // With one card in view (as on phones), there is a dot for each card.
    expect(dots().map((dot) => dot.getAttribute('aria-label'))).toEqual(['Engagement 1', 'Engagement 2', 'Engagement 3']);
    expect(dots()[0]).toHaveAttribute('aria-current', 'true');
    expect(status(carousel)).toHaveTextContent('Engagement 1 of 3');
    // Still focusable at the ends (aria-disabled), so focus is never lost.
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).not.toBeDisabled();

    fireEvent.click(next);
    expect(status(carousel)).toHaveTextContent('Engagement 2 of 3');
    expect(dots()[1]).toHaveAttribute('aria-current', 'true');
    expect(previous).not.toHaveAttribute('aria-disabled');

    fireEvent.click(next);
    fireEvent.click(next);
    expect(status(carousel)).toHaveTextContent('Engagement 3 of 3');
    expect(next).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(previous);
    expect(status(carousel)).toHaveTextContent('Engagement 2 of 3');
  });

  it('jumps to a card from its dot', () => {
    const { carousel } = renderCarousel(several(4));
    fireEvent.click(dots()[2]);
    expect(status(carousel)).toHaveTextContent('Engagement 3 of 4');
    expect(dots()[2]).toHaveAttribute('aria-current', 'true');
    expect(dots()[0]).not.toHaveAttribute('aria-current');
  });

  it('scrolls smoothly to the card, or straight there when reduced motion is preferred', () => {
    const { track } = renderCarousel(several(3));
    layOut(track, { cardWidth: 300, trackWidth: 300 });
    track.scrollTo = vi.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Next engagement' }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: 'smooth' });

    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {},
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Next engagement' }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: 'auto' });
  });

  it('follows a swipe once the cards come to rest', async () => {
    const { carousel, track } = renderCarousel(several(3));
    layOut(track, { cardWidth: 300, trackWidth: 300 });

    track.scrollLeft = 600;
    fireEvent.scroll(track);
    await waitFor(() => expect(status(carousel)).toHaveTextContent('Engagement 3 of 3'));
    expect(dots()[2]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Next engagement' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('counts positions, not cards, when two are in view', () => {
    const { carousel, track } = renderCarousel(several(3));
    layOut(track, { cardWidth: 300, trackWidth: 600 });

    expect(dots().map((dot) => dot.getAttribute('aria-label'))).toEqual(['Engagements 1–2', 'Engagements 2–3']);
    expect(status(carousel)).toHaveTextContent('Engagements 1–2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next engagement' }));
    expect(status(carousel)).toHaveTextContent('Engagements 2–3 of 3');
    expect(screen.getByRole('button', { name: 'Next engagement' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('moves between cards with ← and →', () => {
    const { track } = renderCarousel(several(3));
    const [a, b, c] = within(track).getAllByRole('link');
    a.focus();

    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(b).toHaveFocus();
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    expect(c).toHaveFocus();
    // Past the last card, focus stays put.
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(c).toHaveFocus();
    fireEvent.keyDown(c, { key: 'ArrowLeft' });
    expect(b).toHaveFocus();
  });
});
