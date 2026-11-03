import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Clock, MapPin, Users } from 'lucide-react';
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

/** One labelled detail on the same line as the others, the way an event card lists date, time, and place. */
function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon size={14} className="shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="text-sm font-medium text-navy-800">{children}</dd>
    </div>
  );
}

/**
 * Long descriptions are cut to two lines; the card's footer then offers
 * "Show more". The cut is visual only: screen readers always get the whole text.
 */
function useClampedText(text) {
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

  return { ref, id, expanded, toggle: () => setExpanded((value) => !value), canToggle: clamped || expanded };
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
  // instead of "TBA", and screen readers get the badge alone.
  const cancelledUndated = !leaf && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  const session = formatSessionTime(engagement);
  const location = formatEngagementLocation(engagement);
  const roles = formatRoles(engagement.roles);
  const eventType = optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type);
  const badges = engagementBadges(engagement);
  const hasBadges = badges.length > 0;
  const image = engagement.image_url ? resolveMediaUrl(engagement.image_url) : '';
  const topics = Array.isArray(engagement.topics) ? engagement.topics.filter(Boolean) : [];
  const hasDetails = Boolean(location || session || engagement.organiser);
  const hasActions = hasEngagementActions(engagement);
  const muted = engagement.section === 'previous' || engagement.section === 'cancelled' || engagement.event_status === 'cancelled';
  // Kept apart, so the ref is only handed to the paragraph and never read while rendering.
  const { ref: descriptionRef, id: descriptionId, expanded, toggle, canToggle } = useClampedText(engagement.description);
  const showToggle = Boolean(engagement.description) && canToggle;

  // The ring follows the card's own link, not the separate action buttons.
  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = url
    ? 'group hover:border-cyan-300 hover:shadow-md has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex overflow-hidden rounded-2xl border border-navy-100 bg-white transition-shadow ${linkedClasses}`}
      data-linked={url ? 'true' : 'false'}
    >
      {engagement.in_progress && (
        <span className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300" aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <DateLeaf leaf={leaf} cancelledUndated={cancelledUndated} muted={muted} />

        {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
        <div className="min-w-0 flex-1 wrap-anywhere">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {eventType && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
            )}
            {hasBadges && badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
          </div>

          <Heading className="mt-1 text-base font-bold leading-snug text-navy-900 sm:text-lg">
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

          {/* The leaf shows the dates, but only to sighted visitors. */}
          {dateText && <p className="sr-only">{dateText}</p>}

          {(engagement.session_title || roles) && (
            <p className="mt-0.5 text-sm leading-snug text-navy-700">
              {roles && <span className="font-semibold text-navy-800">{roles}</span>}
              {/* The spaces stay outside the hidden dot so screen readers don't run the two together. */}
              {roles && engagement.session_title && <>{' '}<span aria-hidden="true">·</span>{' '}</>}
              {engagement.session_title && <span>{engagement.session_title}</span>}
            </p>
          )}

          {hasDetails && (
            <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {session && <Detail icon={Clock} label="Session">{session}</Detail>}
              {location && <Detail icon={MapPin} label="Location">{location}</Detail>}
              {engagement.organiser && <Detail icon={Users} label="Organiser">{engagement.organiser}</Detail>}
            </dl>
          )}

          {engagement.description && (
            <p
              id={descriptionId}
              ref={descriptionRef}
              className={`text-sm leading-snug text-navy-600 ${hasDetails ? 'mt-1.5' : 'mt-1'} ${expanded ? '' : 'line-clamp-2'}`}
            >
              {engagement.description}
            </p>
          )}

          {(topics.length > 0 || showToggle || hasActions || url) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              {topics.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-navy-600" aria-hidden="true">Topics</span>
                  <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
                    {topics.map((topic, index) => (
                      <li key={`${topic}-${index}`} className="rounded-md border border-navy-100 px-2 py-0.5 text-xs font-medium text-navy-700">{topic}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(showToggle || hasActions || url) && (
                // Above the stretched link, but only the buttons take clicks: the
                // gaps around them, and the website label, still open the event website.
                <div className="pointer-events-none relative z-10 ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
                  {showToggle && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={descriptionId}
                      onClick={toggle}
                      className="pointer-events-auto rounded-sm text-sm font-semibold text-cyan-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300"
                    >
                      {/* The space sits outside the hidden text so the name doesn't run together. */}
                      {expanded ? 'Show less' : 'Show more'}{' '}
                      <span className="sr-only">about {engagement.event_title}</span>
                    </button>
                  )}
                  {(hasActions || url) && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {hasActions && <EngagementActions engagement={engagement} track={track} />}
                      {url && (
                        // Looks like a button, but the whole card is the link; this only labels it.
                        <span
                          className="pointer-events-none inline-flex items-center gap-1.5 rounded-lg border border-cyan-700 px-3 py-1.5 text-sm font-semibold text-cyan-800 transition-colors group-hover:bg-cyan-700 group-hover:text-white dark:border-cyan-400 dark:text-cyan-300 dark:group-hover:bg-cyan-600 dark:group-hover:text-white"
                          aria-hidden="true"
                        >
                          Event website
                          <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {image && (
        <div className="relative w-28 shrink-0 self-stretch sm:w-44 md:w-56 lg:w-72">
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
