import { EngagementRowList } from './EngagementRow';
import { pastBadges } from './engagementBadges';

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
          <EngagementRowList engagements={items} rowProps={(engagement) => ({ badges: pastBadges(engagement) })} />
        </div>
      ))}
    </div>
  );
}
