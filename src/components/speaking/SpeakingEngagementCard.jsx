import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementDateRange,
  formatEngagementDateLeaf,
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
 * A calendar leaf: the month on a coloured band, then the day or days and the
 * year. It keeps to its own height, so a long description doesn't stretch it,
 * and past or cancelled engagements get a quieter band. Screen readers get the
 * dates from the card's details instead.
 */
function DateLeaf({ leaf, cancelledUndated, muted }) {
  return (
    <div
      className="w-16 shrink-0 self-start overflow-hidden rounded-xl border border-navy-100 bg-white text-center shadow-sm md:row-span-2 md:w-24"
      aria-hidden="true"
    >
      <div className={`px-1 py-1 text-[10px] font-bold uppercase tracking-widest text-white md:py-1.5 md:text-[11px] ${muted ? 'bg-navy-600' : 'bg-cyan-700'}`}>
        {leaf ? leaf.month : 'Date'}
      </div>
      <div className="px-1 py-2 md:py-3">
        {leaf ? (
          <>
            <div className="text-lg font-bold leading-none text-navy-900 md:text-2xl">{leaf.days}</div>
            <div className="mt-1 text-[11px] font-semibold text-navy-600 md:text-xs">{leaf.year}</div>
          </>
        ) : (
          <div className="text-xs font-semibold leading-tight text-navy-700">{cancelledUndated ? 'Cancelled' : 'TBA'}</div>
        )}
      </div>
    </div>
  );
}

/** One labelled detail, such as "Location". */
function Detail({ icon: Icon, label, children }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-navy-600">
        <Icon size={13} className="shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-navy-800">{children}</dd>
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
  const leaf = formatEngagementDateLeaf(engagement);
  // An undated cancellation will never get a date: its leaf reads "Cancelled"
  // instead of "To be announced", and no dates are listed.
  const cancelledUndated = !leaf && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : (leaf ? formatEngagementDateRange(engagement) : 'To be announced');
  const session = formatSessionTime(engagement);
  const location = formatEngagementLocation(engagement);
  const roles = formatRoles(engagement.roles);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = engagementBadges(engagement);
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const topics = Array.isArray(engagement.topics) ? engagement.topics.filter(Boolean) : [];
  const hasDetails = Boolean(dateText || location || session || engagement.organiser);
  const hasActions = hasEngagementActions(engagement);
  const muted = engagement.section === 'previous' || engagement.section === 'cancelled' || engagement.event_status === 'cancelled';

  // The ring follows the card's own link, not the separate action buttons.
  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = url
    ? 'group hover:border-cyan-300 hover:shadow-md has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    // Phones: the date leaf sits beside the title and the details run the full
    // width below. From tablet width the leaf has a column of its own.
    <article
      className={`relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 overflow-hidden rounded-2xl border border-navy-100 bg-white p-4 sm:p-6 md:gap-x-6 transition-shadow ${linkedClasses}`}
      data-linked={url ? 'true' : 'false'}
    >
      {engagement.in_progress && (
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300" aria-hidden="true" />
      )}

      <DateLeaf leaf={leaf} cancelledUndated={cancelledUndated} muted={muted} />

      {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
      <div className="flex min-w-0 items-start gap-4 wrap-anywhere">
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

          {(engagement.session_title || roles) && (
            <p className="mt-1 text-sm text-navy-700">
              {roles && <span className="font-semibold text-navy-800">{roles}</span>}
              {/* The spaces stay outside the hidden dot so screen readers don't run the two together. */}
              {roles && engagement.session_title && <>{' '}<span aria-hidden="true">·</span>{' '}</>}
              {engagement.session_title && <span>{engagement.session_title}</span>}
            </p>
          )}
        </div>
        {/* Too cramped beside the title on phones. */}
        {image && (
          <img
            src={image}
            alt={engagement.image_alt || ''}
            className="hidden size-24 shrink-0 rounded-xl border border-navy-100 bg-white object-contain p-1.5 sm:block"
          />
        )}
      </div>

      <div className="col-span-2 min-w-0 wrap-anywhere md:col-span-1 md:col-start-2">
        {/* After the heading, so screen reader users moving by heading still hear the status. */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
          </div>
        )}

        {hasDetails && (
          <dl className={`grid gap-x-6 gap-y-3 rounded-xl bg-navy-50 p-4 sm:grid-cols-2 ${badges.length > 0 ? 'mt-4' : ''}`}>
            {dateText && <Detail icon={CalendarDays} label="Dates">{dateText}</Detail>}
            {session && <Detail icon={Clock} label="Session">{session}</Detail>}
            {location && <Detail icon={MapPin} label="Location">{location}</Detail>}
            {engagement.organiser && <Detail icon={Users} label="Organiser">{engagement.organiser}</Detail>}
          </dl>
        )}

        {engagement.description && <Description text={engagement.description} title={engagement.event_title} />}

        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-navy-600" aria-hidden="true">Topics</span>
            <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
              {topics.map((topic, index) => (
                <li key={`${topic}-${index}`} className="rounded-md border border-navy-100 px-2 py-0.5 text-xs font-medium text-navy-700">{topic}</li>
              ))}
            </ul>
          </div>
        )}

        {(hasActions || url) && (
          // Above the stretched link, but only the action buttons take clicks:
          // the gaps around them, and the website label, still open the event website.
          <div className="pointer-events-none relative z-10 mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-navy-100 pt-4">
            {hasActions && <EngagementActions engagement={engagement} track={track} />}
            {url && (
              // Looks like a button, but the whole card is the link; this only labels it.
              <span
                className="pointer-events-none ml-auto inline-flex items-center gap-1.5 rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-800 transition-colors group-hover:bg-cyan-700 group-hover:text-white dark:border-cyan-400 dark:text-cyan-300 dark:group-hover:bg-cyan-600 dark:group-hover:text-white"
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
