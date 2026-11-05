import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  SPEAKING_EVENT_TYPES,
  formatEngagementLocation,
  formatEngagementShortRange,
  formatRoles,
  optionLabel,
} from '../../../shared/speakingEngagements.js';
import EngagementBadge from './EngagementBadge';
import { engagementPath } from './engagementLinks';

/**
 * One engagement as a compact row: an optional short date, the title, then
 * type, role and city, and the labels passed in. The title is the row's one
 * link, stretched over the whole row. Pass linked={false} where there is no
 * page to open, such as the admin preview of a draft.
 */
export function EngagementRow({ engagement, badges = [], showDate = true, linked = true, headingLevel = 'h4' }) {
  const Heading = headingLevel;
  const to = linked ? engagementPath(engagement) : '';
  const meta = [
    optionLabel(SPEAKING_EVENT_TYPES, engagement.event_type),
    formatRoles(engagement.roles),
    // City and country only; the venue is on the engagement's page.
    formatEngagementLocation({ ...engagement, venue: null }),
  ].filter(Boolean);
  const columns = showDate ? 'sm:grid-cols-[9rem_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]';
  const linkedClasses = to
    ? 'group transition-colors hover:bg-navy-50 has-[a.card-link:focus-visible]:ring-2 has-[a.card-link:focus-visible]:ring-inset has-[a.card-link:focus-visible]:ring-cyan-700'
    : '';

  return (
    <article className={`relative grid gap-x-6 gap-y-1 px-4 py-3 sm:items-center sm:px-5 ${columns} ${linkedClasses}`}>
      {showDate && <p className="text-sm font-semibold text-navy-700">{formatEngagementShortRange(engagement)}</p>}
      <div className="min-w-0 wrap-anywhere">
        <Heading className="font-semibold leading-snug text-navy-900">
          {to ? (
            <Link
              to={to}
              state={{ engagement }}
              className="card-link after:absolute after:inset-0 after:content-[''] focus:outline-hidden group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
            >
              {engagement.event_title}
            </Link>
          ) : (
            engagement.event_title
          )}
        </Heading>
        {meta.length > 0 && <p className="mt-0.5 text-sm text-navy-600">{meta.join(' · ')}</p>}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {badges.map((badge) => <EngagementBadge key={badge.label} tone={badge.tone}>{badge.label}</EngagementBadge>)}
        {to && (
          <ChevronRight size={18} className="hidden shrink-0 text-navy-400 transition-colors group-hover:text-cyan-700 sm:block dark:group-hover:text-cyan-300" aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

/** Rows in one bordered list. `rowProps` returns extra props for each row. */
export function EngagementRowList({ engagements, rowProps = () => ({}) }) {
  return (
    <ul className="divide-y divide-navy-100 overflow-hidden rounded-2xl border border-navy-100 bg-white">
      {engagements.map((engagement) => (
        <li key={engagement.id}>
          <EngagementRow engagement={engagement} {...rowProps(engagement)} />
        </li>
      ))}
    </ul>
  );
}
