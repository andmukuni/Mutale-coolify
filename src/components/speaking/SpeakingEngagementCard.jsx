import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateRange,
  formatEngagementDateLeaf,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import EngagementBadge from './EngagementBadge';
import { engagementBadges } from './engagementBadges';
import { engagementPath } from './engagementLinks';

/**
 * A calendar leaf: the month on a coloured band, then the day or days and the
 * year. It keeps to its own height, so a long description doesn't stretch it,
 * and past or cancelled engagements get a quieter band. Screen readers get the
 * dates from the card's details instead.
 */
function DateLeaf({ leaf, cancelledUndated, muted }) {
  return (
    <div
      className="w-14 shrink-0 self-start overflow-hidden rounded-xl border border-navy-100 bg-white text-center shadow-sm sm:w-16"
      aria-hidden="true"
    >
      <div className={`px-1 py-1 text-[10px] font-bold uppercase tracking-widest text-white ${muted ? 'bg-navy-600' : 'bg-cyan-700'}`}>
        {leaf ? leaf.month : 'Date'}
      </div>
      <div className="px-1 py-1.5">
        {leaf ? (
          <>
            {/* A range ("03–05") needs the smaller size to stay on one line. */}
            <div className={`whitespace-nowrap font-bold leading-none text-navy-900 ${leaf.days.length > 2 ? 'text-sm' : 'text-base'}`}>
              {leaf.days}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-navy-600">{leaf.year}</div>
          </>
        ) : (
          <div className="text-xs font-semibold leading-tight text-navy-700">{cancelledUndated ? 'Cancelled' : 'TBA'}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Public speaking engagement card: just enough to pick an engagement out of the
 * list. Everything else (session, venue, organiser, description, recordings,
 * Add to calendar and the event website) is on the engagement's own page.
 * The title is a link to that page, stretched over the card, so the whole card
 * is clickable while there is still one link and one tab stop.
 * Pass linked={false} where there is no page to open, such as the admin preview of a draft.
 */
export default function SpeakingEngagementCard({ engagement, headingLevel = 'h3', linked = true }) {
  const Heading = headingLevel;
  const to = linked ? engagementPath(engagement) : '';
  const leaf = formatEngagementDateLeaf(engagement);
  // An undated cancellation will never get a date: its leaf reads "Cancelled"
  // instead of "TBA", and screen readers get the badge alone.
  const cancelledUndated = !leaf && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  // City and country only; the venue is on the engagement's page.
  const place = formatEngagementLocation({ ...engagement, venue: null });
  const roles = formatRoles(engagement.roles);
  const summary = [roles, place].filter(Boolean);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = engagementBadges(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const muted = engagement.section === 'previous' || engagement.section === 'cancelled' || engagement.event_status === 'cancelled';

  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = to
    ? 'group hover:border-cyan-200 hover:shadow-lg hover:shadow-navy-900/10 motion-safe:hover:-translate-y-0.5 has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex overflow-hidden rounded-2xl border border-navy-100 bg-white transition-shadow ${linkedClasses}`}
      data-linked={to ? 'true' : 'false'}
    >
      {engagement.in_progress && (
        <span className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300" aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <DateLeaf leaf={leaf} cancelledUndated={cancelledUndated} muted={muted} />

        {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
        <div className="min-w-0 flex-1 wrap-anywhere">
          {(eventType || badges.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {eventType && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
              )}
              {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
            </div>
          )}

          <Heading className="mt-1 text-base font-bold leading-snug text-navy-900 sm:text-lg">
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

          {/* The leaf shows the dates, but only to sighted visitors. */}
          {dateText && <p className="sr-only">{dateText}</p>}

          {summary.length > 0 && (
            <p className="mt-0.5 text-sm leading-snug text-navy-700">
              {roles && <span className="font-semibold text-navy-800">{roles}</span>}
              {/* The spaces stay outside the hidden dot so screen readers don't run the two together. */}
              {roles && place && <>{' '}<span aria-hidden="true">·</span>{' '}</>}
              {place && <span>{place}</span>}
            </p>
          )}

          {to && (
            // The link's name is the title; this only says where it leads.
            <span
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 dark:text-cyan-300"
              aria-hidden="true"
            >
              View details
              <ArrowRight size={15} className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </div>

      {image && (
        <div className="relative w-24 shrink-0 self-stretch sm:w-36 md:w-44 lg:w-52">
          <img
            src={image}
            alt={engagement.image_alt || ''}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
    </article>
  );
}
