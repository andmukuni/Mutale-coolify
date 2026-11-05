import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import EngagementGridCard from './EngagementGridCard';

// A swipe or trackpad scroll updates the position once it has come to rest.
const SETTLE_MS = 120;

// Two cards in view from 640 px, one on phones with the next one peeking in so
// it's clear the row can be swiped. A single engagement fills the phone width.
const SLIDE_WIDTH = 'sm:w-[calc((100%-1.25rem)/2)]';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** How many cards are in view and how far apart they start, read from the rendered track. */
function measure(track) {
  const first = track?.children[0];
  // Without layout (as in tests) there's nothing to measure: assume one in view.
  if (!first?.offsetWidth) return null;
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  const stride = first.offsetWidth + gap;
  return { stride, perView: Math.max(1, Math.round((track.clientWidth + gap) / stride)) };
}

/** "Engagement 3", or "Engagements 3–4" when more than one card is in view. */
function cardsInView(start, perView, count) {
  const end = Math.min(start + perView, count);
  return end - start > 1 ? `Engagements ${start + 1}–${end}` : `Engagement ${start + 1}`;
}

const ARROW = 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy-200 bg-white text-navy-900 shadow-sm transition-colors hover:border-cyan-300 hover:text-cyan-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-navy-200 aria-disabled:hover:text-navy-900 dark:hover:text-cyan-300';

/**
 * Upcoming engagements as a row of cards that slides sideways: swipe or scroll
 * it, use the arrows or dots, or Tab through the cards (each comes into view as
 * it takes focus); ← and → move between cards. The controls follow the cards,
 * in the order they appear, and only show when there is more than fits.
 */
export default function EngagementCarousel({ engagements, label = 'Upcoming engagements' }) {
  const trackRef = useRef(null);
  const settleTimer = useRef(null);
  const [index, setIndex] = useState(0);
  const [perView, setPerView] = useState(1);
  const count = engagements.length;
  const positions = Math.max(1, count - perView + 1);
  const current = Math.min(index, positions - 1);

  // The number of cards in view changes at the breakpoints.
  useEffect(() => {
    const update = () => {
      const layout = measure(trackRef.current);
      if (layout) setPerView(layout.perView);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [count]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const readPosition = useCallback(() => {
    const track = trackRef.current;
    const layout = measure(track);
    if (layout) setIndex(Math.round(track.scrollLeft / layout.stride));
  }, []);

  const handleScroll = () => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(readPosition, SETTLE_MS);
  };

  const goTo = (target) => {
    const next = Math.max(0, Math.min(target, positions - 1));
    setIndex(next);
    const track = trackRef.current;
    const slide = track?.children[next];
    if (!slide) return;
    const left = slide.offsetLeft - track.children[0].offsetLeft;
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior });
    else track.scrollLeft = left;
  };

  // ← and → move focus to the neighbouring card, which scrolls it into view.
  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const slides = [...trackRef.current.children];
    const from = slides.findIndex((slide) => slide.contains(event.target));
    const link = slides[from + (event.key === 'ArrowRight' ? 1 : -1)]?.querySelector('a[href]');
    if (from < 0 || !link) return;
    event.preventDefault();
    link.focus();
  };

  const atStart = current === 0;
  const atEnd = current >= positions - 1;
  const showControls = positions > 1;

  return (
    <div role="group" aria-roledescription="carousel" aria-label={label}>
      {/* The padding gives focus rings and hover shadows room inside the scrolling area;
          the negative margins keep the cards lined up with the heading. */}
      <ul
        ref={trackRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="relative -mx-2 -mt-2 flex snap-x snap-mandatory scroll-px-2 gap-4 overflow-x-auto overscroll-x-contain px-2 pt-2 pb-5 [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden"
      >
        {engagements.map((engagement) => (
          <li key={engagement.id} className={`flex shrink-0 snap-start ${count === 1 ? 'w-full' : 'w-[85%]'} ${SLIDE_WIDTH}`}>
            <EngagementGridCard engagement={engagement} headingLevel="h3" />
          </li>
        ))}
      </ul>

      {showControls && (
        <div className="mt-1 flex items-center justify-between gap-4">
          <div className="-ml-1.5 flex flex-wrap items-center" role="group" aria-label="Choose engagements to show">
            {Array.from({ length: positions }, (_, position) => (
              <button
                key={position}
                type="button"
                onClick={() => goTo(position)}
                aria-label={cardsInView(position, perView, count)}
                aria-current={position === current ? 'true' : undefined}
                className="group/dot inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700"
              >
                <span
                  className={`block h-2.5 rounded-full motion-safe:transition-all ${
                    position === current
                      ? 'w-6 bg-cyan-700 dark:bg-cyan-300'
                      : 'w-2.5 bg-navy-500 group-hover/dot:bg-cyan-700 dark:bg-navy-400 dark:group-hover/dot:bg-cyan-300'
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className={ARROW}
              onClick={() => { if (!atStart) goTo(current - 1); }}
              aria-disabled={atStart ? 'true' : undefined}
              aria-label="Previous engagement"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={ARROW}
              onClick={() => { if (!atEnd) goTo(current + 1); }}
              aria-disabled={atEnd ? 'true' : undefined}
              aria-label="Next engagement"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Says which cards are in view after each move. Not a "status" role, so it
          doesn't compete with the section's loading message. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {showControls ? `${cardsInView(current, perView, count)} of ${count}` : ''}
      </p>
    </div>
  );
}
