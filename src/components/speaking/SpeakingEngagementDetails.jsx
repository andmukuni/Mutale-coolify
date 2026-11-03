import { useId } from 'react';
import { ArrowUpRight, CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { safeExternalUrl } from '../../../shared/safeUrl.js';
import {
  formatEngagementDateLeaf,
  formatEngagementDateRange,
  formatEngagementLocation,
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

/**
 * Everything about one engagement that its card leaves out: dates, Mutale's
 * session, the place and organiser, the full description and topics, then the
 * recordings, "Add to calendar" and the event website. Used on the
 * engagement's page and in the admin preview (with track={false}).
 */
export default function SpeakingEngagementDetails({ engagement, track = true }) {
  const aboutId = useId();
  const detailsId = useId();
  const url = safeExternalUrl(engagement.event_url);
  const cancelledUndated = !formatEngagementDateLeaf(engagement) && engagement.event_status === 'cancelled';
  const dateText = cancelledUndated ? '' : formatEngagementDateRange(engagement);
  const session = formatSessionTime(engagement);
  const location = formatEngagementLocation(engagement);
  const topics = Array.isArray(engagement.topics) ? engagement.topics.filter(Boolean) : [];
  const hasActions = hasEngagementActions(engagement);
  const hasAbout = Boolean(engagement.description) || topics.length > 0;
  const hasDetails = Boolean(dateText || session || engagement.session_title || location || engagement.organiser);

  return (
    <div className={`grid items-start gap-6 ${hasAbout ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'max-w-xl'}`}>
      {hasAbout && (
        <section aria-labelledby={aboutId} className="rounded-2xl border border-navy-100 bg-white p-5 sm:p-6 wrap-anywhere">
          <h2 id={aboutId} className="text-lg font-bold text-navy-900">About this engagement</h2>
          {engagement.description && (
            <p className="mt-3 whitespace-pre-line leading-relaxed text-navy-700">{engagement.description}</p>
          )}
          {topics.length > 0 && (
            <div className={engagement.description ? 'mt-5' : 'mt-3'}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-navy-600">Topics</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {topics.map((topic, index) => (
                  <li key={`${topic}-${index}`} className="rounded-md border border-navy-100 px-2 py-0.5 text-xs font-medium text-navy-700">{topic}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {(hasDetails || url || hasActions) && (
        <section aria-labelledby={detailsId} className="rounded-2xl border border-navy-100 bg-white p-5 sm:p-6 wrap-anywhere">
          <h2 id={detailsId} className="text-lg font-bold text-navy-900">Details</h2>
          {hasDetails && (
            <dl className="mt-4 space-y-4">
              {dateText && <Detail icon={CalendarDays} label="Dates">{dateText}</Detail>}
              {(session || engagement.session_title) && (
                <Detail icon={Clock} label="Mutale’s session">
                  {engagement.session_title && <span className="block font-semibold">{engagement.session_title}</span>}
                  {session && <span className="block">{session}</span>}
                </Detail>
              )}
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
