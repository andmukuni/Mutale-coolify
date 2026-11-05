import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import EngagementBadge from './EngagementBadge';
import { listingBadges } from './engagementBadges';
import { engagementPath } from './engagementLinks';

/** Without a photo, the top of the card shows the date large on the banner's navy. */
function DatePanel({ leaf, cancelledUndated }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 px-4 text-center text-white"
      aria-hidden="true"
    >
      {leaf ? (
        <>
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">{leaf.month}</span>
          <span className="mt-2 whitespace-nowrap text-4xl font-bold leading-none sm:text-5xl">{leaf.days}</span>
          <span className="mt-2 text-sm font-semibold text-white/70">{leaf.year}</span>
        </>
      ) : (
        <span className="text-lg font-semibold">{cancelledUndated ? 'Cancelled' : 'Dates to be announced'}</span>
      )}
    </div>
  );
}

/** Over a photo, the date sits in a small leaf in the corner. */
function DateChip({ leaf }) {
  return (
    <div className="absolute left-3 top-3 min-w-14 rounded-xl bg-white px-2.5 py-1.5 text-center shadow-md" aria-hidden="true">
      <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{leaf.month}</div>
      <div className="whitespace-nowrap text-lg font-bold leading-tight text-navy-900">{leaf.days}</div>
      <div className="text-[10px] font-semibold text-navy-600">{leaf.year}</div>
    </div>
  );
}

/**
 * An upcoming engagement as a card in a grid: the photo (or the date, when
 * there is no photo) on top, then the type, any label that sets it apart, the
 * title, role and place. Everything else is on the engagement's own page.
 * The title is the one link, stretched over the card.
 * Pass linked={false} where there is no page to open, such as the admin preview of a draft.
 */
export default function EngagementGridCard({ engagement, headingLevel = 'h3', linked = true }) {
  const Heading = headingLevel;
  const to = linked ? engagementPath(engagement) : '';
  const leaf = formatEngagementDateLeaf(engagement);
  // An undated cancellation will never get a date, so it never promises one.
  const cancelledUndated = !leaf && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  // City and country only; the venue is on the engagement's page.
  const place = formatEngagementLocation({ ...engagement, venue: null });
  const roles = formatRoles(engagement.roles);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = listingBadges(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';

  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = to
    ? 'group hover:border-cyan-300 hover:shadow-lg has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white transition-shadow ${linkedClasses}`}
      data-linked={to ? 'true' : 'false'}
    >
      {/* A little shallower on phones, where the cards stack. */}
      <div className="relative aspect-[2/1] shrink-0 overflow-hidden bg-navy-900 sm:aspect-[16/9]">
        {image ? (
          <>
            <img
              src={image}
              alt={engagement.image_alt || ''}
              // Portraits: keep faces in view rather than centring on the middle.
              className="absolute inset-0 h-full w-full object-cover object-[50%_25%] transition-transform duration-300 group-hover:scale-[1.03]"
            />
            {leaf && <DateChip leaf={leaf} />}
          </>
        ) : (
          <DatePanel leaf={leaf} cancelledUndated={cancelledUndated} />
        )}
        {engagement.in_progress && (
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300" aria-hidden="true" />
        )}
      </div>

      {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
      <div className="flex flex-1 flex-col p-4 sm:p-5 wrap-anywhere">
        {(eventType || badges.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {eventType && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
            )}
            {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
          </div>
        )}

        <Heading className="mt-1.5 text-lg font-bold leading-snug text-navy-900">
          {to ? (
            <Link
              to={to}
              // The page can show the engagement straight away while it fetches the latest.
              state={{ engagement }}
              className="card-link rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-hidden group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
            >
              {engagement.event_title}
            </Link>
          ) : (
            engagement.event_title
          )}
        </Heading>

        {/* The date on the photo or panel is only for sighted visitors. */}
        {dateText && <p className="sr-only">{dateText}</p>}

        {(roles || place) && (
          <p className="mt-1 text-sm leading-snug text-navy-700">
            {roles && <span className="font-semibold text-navy-800">{roles}</span>}
            {/* The spaces stay outside the hidden dot so screen readers don't run the two together. */}
            {roles && place && <>{' '}<span aria-hidden="true">·</span>{' '}</>}
            {place && <span>{place}</span>}
          </p>
        )}

        {to && (
          // The link's name is the title; this only says where it leads. It
          // sits at the bottom, so it lines up across a row of cards.
          <span
            className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-cyan-800 dark:text-cyan-300"
            aria-hidden="true"
          >
            View details
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </article>
  );
}
