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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Public speaking engagement card.
 * With a valid event URL the title is a real link stretched over the card; the
 * whole card is clickable but there is one link, one tab stop, and the card's
 * text is still read normally. Without a URL it is a plain, non-interactive card.
 * Separate actions (recordings, Add to calendar) sit above the stretched link.
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

  // The ring follows the card's own link, not the separate action buttons.
  // Forced-colours mode drops rings, so the link also keeps a transparent
  // outline (outline-hidden) that the system then draws in its focus colour.
  const linkedClasses = url
    ? 'group hover:border-cyan-300 hover:shadow-md has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-cyan-700 has-[a.card-link:focus-visible]:ring-offset-2'
    : '';

  return (
    <article
      className={`relative flex flex-col gap-4 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5 md:flex-row md:items-start md:gap-6 transition-shadow ${linkedClasses}`}
      data-linked={url ? 'true' : 'false'}
    >
      <div
        className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-cyan-50 px-4 py-3 text-center md:w-32 md:self-stretch dark:bg-cyan-500/10"
        aria-hidden="true"
      >
        {tile ? (
          <>
            <span className="text-xl font-bold leading-tight text-navy-900">{tile.primary}</span>
            <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">{tile.secondary}</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-navy-700">{cancelledUndated ? 'Cancelled' : 'Date to be announced'}</span>
        )}
      </div>

      {/* Long unbroken text (pasted links, email addresses) wraps instead of widening the card. */}
      <div className="min-w-0 flex-1 wrap-anywhere">
        {eventType && (
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">{eventType}</p>
        )}
        <Heading className="mt-1 text-lg font-bold leading-snug text-navy-900">
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

        {hasDetails && (
          <ul className="mt-2 space-y-1 text-sm text-navy-600">
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

        {engagement.description && (
          <p className="mt-2 text-sm leading-relaxed text-navy-600">{engagement.description}</p>
        )}

        {topics.length > 0 && (
          <p className="mt-2 text-xs text-navy-600">
            <span className="font-semibold">Topics:</span> {topics.join(' · ')}
          </p>
        )}

        <EngagementActions engagement={engagement} track={track} />
      </div>

      {(badges.length > 0 || image || url) && (
        <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 md:w-44 md:flex-col md:items-end md:self-stretch">
          {image && (
            <img src={image} alt={engagement.image_alt || ''} className="h-12 w-auto max-w-[9rem] object-contain" />
          )}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
            </div>
          )}
          {url && (
            // The arrow's hover nudge lifts it above the title link's overlay, so
            // clicks on the label and arrow are passed through to that overlay.
            <span
              className="pointer-events-none inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 md:mt-auto dark:text-cyan-300"
              aria-hidden="true"
            >
              Event website
              <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      )}
    </article>
  );
}
