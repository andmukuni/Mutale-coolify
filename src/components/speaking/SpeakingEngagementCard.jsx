import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Clock, MapPin, Users } from 'lucide-react';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateRange,
  formatEngagementDateTile,
  formatEngagementLocation,
  formatRoles,
  formatSessionTime,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { trackSpeaking } from '../../utils/speakingMetrics';
import EngagementActions from './EngagementActions';
import { engagementBadges } from './engagementBadges';
import { hasEngagementActions } from './engagementMedia';

// Text labels carry the meaning; colour only reinforces it.
const BADGE_STYLES = {
  live: 'bg-cyan-700 text-white',
  cancelled: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/30',
  postponed: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30',
  confirmed: 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/30',
  invited: 'bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200 dark:ring-navy-500/40',
  access: 'bg-white text-navy-700 ring-1 ring-inset ring-navy-200 dark:ring-navy-500/40',
};

function Badge({ tone, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[tone]}`}>
      {tone === 'live' && <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * A chip above the content on phones, a tile beside it from tablet width. It
 * keeps to its own height, so a long description doesn't stretch it. Past and
 * cancelled engagements get a quieter tile. Screen readers get the full date
 * from the card's text instead.
 */
function DateTile({ tile, cancelledUndated, muted }) {
  const tone = muted ? 'bg-navy-50' : 'bg-cyan-50 dark:bg-cyan-500/10';
  const secondaryTone = muted ? 'text-navy-600' : 'text-cyan-800 dark:text-cyan-300';
  return (
    <div
      className={`flex shrink-0 items-baseline gap-2 self-start rounded-lg px-3 py-1.5 md:w-28 md:flex-col md:items-center md:gap-0 md:rounded-xl md:py-4 md:text-center ${tone}`}
      aria-hidden="true"
    >
      {tile ? (
        <>
          {/* Ranges across months ("30 Dec – 02 Jan") need a smaller size to fit the tile. */}
          <span className={`text-base font-bold leading-tight text-navy-900 ${tile.primary.length > 6 ? 'md:text-lg' : 'md:text-2xl'}`}>
            {tile.primary}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide md:mt-1 ${secondaryTone}`}>{tile.secondary}</span>
        </>
      ) : (
        <span className="text-sm font-semibold text-navy-700">{cancelledUndated ? 'Cancelled' : 'Date to be announced'}</span>
      )}
    </div>
  );
}

/**
 * Long descriptions are cut to three lines, with a button to show the rest.
 * The cut is visual only: screen readers always get the whole text.
 */
function Description({ text, title }) {
  const ref = useRef(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return undefined;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="mt-3">
      <p id={id} ref={ref} className={`text-sm leading-relaxed text-navy-600 ${expanded ? '' : 'line-clamp-3'}`}>{text}</p>
      {(clamped || expanded) && (
        // Above the card's stretched link, like the other separate actions.
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className="relative z-10 mt-1 rounded-sm text-sm font-semibold text-cyan-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300"
        >
          {/* The space sits outside the hidden text so the name doesn't run together. */}
          {expanded ? 'Show less' : 'Show more'}{' '}
          <span className="sr-only">about {title}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Public speaking engagement card.
 * With a valid event URL the title is a real link stretched over the card; the
 * whole card is clickable but there is one link, one tab stop, and the card's
 * text is still read normally. Without a URL it is a plain, non-interactive card.
 * Separate actions (recordings, Add to calendar, Show more) sit above the stretched link.
 * Pass track={false} where clicks shouldn't be counted, such as admin previews.
 */
export default function SpeakingEngagementCard({ engagement, headingLevel = 'h3', track = true }) {
  const Heading = headingLevel;
  const url = safeExternalUrl(engagement.event_url);
  const tile = formatEngagementDateTile(engagement);
  // An undated cancellation will never get a date: its tile reads "Cancelled"
  // instead of "Date to be announced", and screen readers get the badge alone.
  const cancelledUndated = !tile && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  const session = formatSessionTime(engagement);
  const location = formatEngagementLocation(engagement);
  const roles = formatRoles(engagement.roles);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = engagementBadges(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const topics = Array.isArray(engagement.topics) ? engagement.topics.filter(Boolean) : [];
  const hasDetails = Boolean(location || session || engagement.organiser);
  const hasActions = hasEngagementActions(engagement);
  const muted = engagement.section === 'previous' || engagement.section === 'cancelled' || engagement.event_status === 'cancelled';

  // The ring follows the card's own link, not the separate action buttons.
  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = url
    ? 'group hover:border-cyan-300 hover:shadow-md has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex flex-col gap-3 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5 md:flex-row md:gap-6 transition-shadow ${linkedClasses}`}
      data-linked={url ? 'true' : 'false'}
    >
      <DateTile tile={tile} cancelledUndated={cancelledUndated} muted={muted} />

      {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
      <div className="min-w-0 flex-1 wrap-anywhere">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {eventType && (
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
            )}
            <Heading className="mt-1 text-lg font-bold leading-snug text-navy-900 sm:text-xl">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${engagement.event_title} — event website (opens in a new tab)`}
                  onClick={() => { if (track) trackSpeaking('event_website_click', engagement.id); }}
                  className="card-link rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-hidden group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
                >
                  {engagement.event_title}
                </a>
              ) : (
                engagement.event_title
              )}
            </Heading>

            {dateText && <p className="sr-only">{dateText}</p>}

            {(engagement.session_title || roles) && (
              <p className="mt-1 text-sm text-navy-700">
                {roles && <span className="font-semibold">{roles}</span>}
                {/* The spaces stay outside the hidden dot so screen readers don't run the two together. */}
                {roles && engagement.session_title && <>{' '}<span aria-hidden="true">·</span>{' '}</>}
                {engagement.session_title && <span>{engagement.session_title}</span>}
              </p>
            )}
          </div>
          {image && (
            <img
              src={image}
              alt={engagement.image_alt || ''}
              className="size-14 shrink-0 rounded-lg border border-navy-100 bg-white object-contain p-1 sm:size-20"
            />
          )}
        </div>

        {/* After the heading, so screen reader users moving by heading still hear the status. */}
        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
          </div>
        )}

        {hasDetails && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-navy-600">
            {location && (
              <li className="flex items-start gap-1.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                <span>{location}</span>
              </li>
            )}
            {session && (
              <li className="flex items-start gap-1.5">
                <Clock size={15} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                <span>Session: {session}</span>
              </li>
            )}
            {engagement.organiser && (
              <li className="flex items-start gap-1.5">
                <Users size={15} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                <span>Organised by {engagement.organiser}</span>
              </li>
            )}
          </ul>
        )}

        {engagement.description && <Description text={engagement.description} title={engagement.event_title} />}

        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-navy-600" aria-hidden="true">Topics</span>
            <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
              {topics.map((topic, index) => (
                <li key={`${topic}-${index}`} className="rounded-md bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700">{topic}</li>
              ))}
            </ul>
          </div>
        )}

        {(hasActions || url) && (
          // Above the stretched link, but only the action buttons take clicks:
          // the gaps around them, and the label, still open the event website.
          <div className="pointer-events-none relative z-10 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-navy-100 pt-4">
            {hasActions && <EngagementActions engagement={engagement} track={track} />}
            {url && (
              <span
                className="pointer-events-none ml-auto inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 dark:text-cyan-300"
                aria-hidden="true"
              >
                Event website
                <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
