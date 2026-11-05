import { useId } from 'react';
import { ArrowUpRight, CalendarDays, Clock, MapPin, Mic, Users } from 'lucide-react';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import {
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
  formatRoles,
  formatSessionTime,
} from '../../../shared/speakingEngagements.js';
import { trackSpeaking } from '../../utils/speakingMetrics';
import EngagementActions from './EngagementActions';
import { hasEngagementActions } from './engagementMedia';

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-navy-600">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-navy-800">{children}</dd>
      </div>
    </div>
  );
}

const CARD = 'rounded-2xl border border-navy-100 bg-white p-5 sm:p-6 wrap-anywhere';

/**
 * Everything about one engagement that its card leaves out. Mutale's session
 * leads, highlighted; then the full description and topics. Beside them (and
 * staying in view on wide screens) the dates, place and organiser, the event
 * website, "Add to calendar" and any recordings. Used on the engagement's page
 * and in the admin preview (with track={false}, and stickyDetails={false} as it
 * scrolls inside a dialog).
 */
export default function SpeakingEngagementDetails({ engagement, track = true, stickyDetails = true }) {
  const sessionId = useId();
  const aboutId = useId();
  const detailsId = useId();
  const url = safeExternalUrl(engagement.event_url);
  const cancelledUndated = !formatEngagementDateLeaf(engagement) && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  const session = formatSessionTime(engagement);
  const roles = formatRoles(engagement.roles);
  const location = formatEngagementLocation(engagement);
  const topics = Array.isArray(engagement.topics) ? engagement.topics.filter(Boolean) : [];
  const hasActions = hasEngagementActions(engagement);
  const hasSession = Boolean(engagement.session_title || session);
  const hasAbout = Boolean(engagement.description) || topics.length > 0;
  const hasMain = hasSession || hasAbout;
  const hasDetails = Boolean(dateText || location || engagement.organiser);

  return (
    <div className={`grid items-start gap-6 ${hasMain ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'max-w-xl'}`}>
      {hasMain && (
        <div className="min-w-0 space-y-6">
          {hasSession && (
            <section
              aria-labelledby={sessionId}
              className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5 pl-6 sm:p-6 sm:pl-7 wrap-anywhere dark:border-cyan-500/30 dark:from-cyan-500/10 dark:to-transparent"
            >
              <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-cyan-500 to-cyan-800" aria-hidden="true" />
              <h2 id={sessionId} className="text-xs font-semibold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Mutale’s session</h2>
              {engagement.session_title && (
                <p className="mt-2 text-xl sm:text-2xl font-bold leading-snug text-navy-900">{engagement.session_title}</p>
              )}
              {(roles || session) && (
                <div className="mt-3 flex flex-col gap-2 text-sm text-navy-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  {roles && (
                    <p className="flex items-start gap-2">
                      <Mic size={16} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
                      <span className="font-semibold text-navy-800">{roles}</span>
                    </p>
                  )}
                  {session && (
                    <p className="flex items-start gap-2">
                      <Clock size={16} className="mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
                      <span>{session}</span>
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {hasAbout && (
            <section aria-labelledby={aboutId} className={CARD}>
              <h2 id={aboutId} className="text-lg font-bold text-navy-900">About this engagement</h2>
              {engagement.description && (
                <p className="mt-3 whitespace-pre-line leading-relaxed text-navy-700">{engagement.description}</p>
              )}
              {topics.length > 0 && (
                <div className={engagement.description ? 'mt-6 border-t border-navy-100 pt-5' : 'mt-3'}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-navy-600">Topics</h3>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {topics.map((topic, index) => (
                      <li
                        key={`${topic}-${index}`}
                        className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300"
                      >
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {(hasDetails || url || hasActions) && (
        <section aria-labelledby={detailsId} className={`${CARD} ${stickyDetails ? 'lg:sticky lg:top-24' : ''}`}>
          <h2 id={detailsId} className="text-lg font-bold text-navy-900">Details</h2>
          {hasDetails && (
            <dl className="mt-4 space-y-4">
              {dateText && <Detail icon={CalendarDays} label="Dates">{dateText}</Detail>}
              {location && <Detail icon={MapPin} label="Location">{location}</Detail>}
              {engagement.organiser && <Detail icon={Users} label="Organiser">{engagement.organiser}</Detail>}
            </dl>
          )}

          {(url || hasActions) && (
            <div className={`flex flex-col gap-3 ${hasDetails ? 'mt-6 border-t border-navy-100 pt-5' : 'mt-4'}`}>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { if (track) trackSpeaking('event_website_click', engagement.id); }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
                >
                  Event website
                  <ArrowUpRight size={16} aria-hidden="true" />
                  {/* The space keeps the name from running together: "Event website (opens in a new tab)". */}
                  {' '}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              {hasActions && <EngagementActions engagement={engagement} track={track} stacked />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
