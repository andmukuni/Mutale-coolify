// Text labels carry the meaning; colour only reinforces it.
const BADGE_STYLES = {
  live: 'bg-cyan-700 text-white',
  cancelled: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/30',
  postponed: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30',
  confirmed: 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/30',
  invited: 'bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200 dark:ring-navy-500/40',
  access: 'bg-white text-navy-700 ring-1 ring-inset ring-navy-200 dark:ring-navy-500/40',
};

/** A status label on a speaking engagement, from engagementBadges(). */
export default function EngagementBadge({ tone, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[tone]}`}>
      {tone === 'live' && <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />}
      {children}
    </span>
  );
}
