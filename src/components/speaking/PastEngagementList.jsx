import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementShortRange,
  formatEngagementLocation,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import EngagementBadge from './EngagementBadge';
import { engagementBadges } from './engagementBadges';
import { engagementPath } from './engagementLinks';

/** Year groups in the order given (the server sends the most recent first). */
function groupByYear(engagements) {
  const groups = [];
  for (const engagement of engagements) {
    const year = String(engagement.start_date || '').slice(0, 4) || 'Date not known';
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(engagement);
    else groups.push({ year, items: [engagement] });
  }
  return groups;
}

function PastEngagementRow({ engagement }) {
  const date = formatEngagementShortRange(engagement);
  const meta = [
    optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type),
    formatRoles(engagement.roles),
    // City and country only; the venue is on the engagement's page.
    formatEngagementLocation({ ...engagement, venue: null }),
  ].filter(Boolean);
  // Whether it was open to the public matters less once it is over.
  const badges = engagementBadges(engagement).filter((badge) => badge.tone !== 'access');

  return (
    // The title is the row's one link, stretched over the whole row.
    <article className="group relative grid gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-navy-50 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5 has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-inset has-[a.card-link:focus-visible]:ring-cyan-700">
      <p className="text-sm font-semibold text-navy-700">{date}</p>
      <div className="min-w-0 wrap-anywhere">
        <h4 className="font-semibold leading-snug text-navy-900">
          <Link
            to={engagementPath(engagement)}
            state={{ engagement }}
            className="card-link after:absolute after:inset-0 after:content-[''] focus:outline-hidden group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
          >
            {engagement.event_title}
          </Link>
        </h4>
        {meta.length > 0 && <p className="mt-0.5 text-sm text-navy-600">{meta.join(' · ')}</p>}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
        <ChevronRight size={18} className="hidden shrink-0 text-navy-400 transition-colors group-hover:text-cyan-700 sm:block dark:group-hover:text-cyan-300" aria-hidden="true" />
      </div>
    </article>
  );
}

/**
 * Engagements that have passed, as one compact row each under a heading for
 * its year, so the list stays short as it grows. Each row opens the
 * engagement's page. Used for "Where I've Spoken" and past cancellations.
 */
export default function PastEngagementList({ engagements }) {
  return (
    <div className="space-y-6">
      {groupByYear(engagements).map(({ year, items }) => (
        <div key={year}>
          <h3 className="mb-2 flex items-center gap-3 text-sm font-bold tracking-wider text-navy-700">
            {year}
            <span className="h-px flex-1 bg-navy-200" aria-hidden="true" />
          </h3>
          <ul className="divide-y divide-navy-100 overflow-hidden rounded-2xl border border-navy-100 bg-white">
            {items.map((engagement) => (
              <li key={engagement.id}>
                <PastEngagementRow engagement={engagement} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
