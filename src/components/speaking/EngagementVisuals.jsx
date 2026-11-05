import { GraduationCap, Landmark, MessagesSquare, Mic, MonitorPlay, Presentation, Users } from 'lucide-react';

const TYPE_ICONS = {
  conference: Presentation,
  forum: MessagesSquare,
  seminar: GraduationCap,
  summit: Landmark,
  workshop: Users,
  webinar: MonitorPlay,
};

/**
 * Stands in for a photo: the banner's navy and teal, with an icon for the kind
 * of event. Fills its (positioned) parent. Used on the cards and the engagement's page.
 */
export function EngagementPlaceholder({ eventType, large = false }) {
  const Icon = TYPE_ICONS[eventType] || Mic;
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900" aria-hidden="true">
      <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-400/10" />
      <span className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-cyan-300/10" />
      <span
        className={`absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/15 bg-white/5 ${large ? 'h-20 w-20' : 'h-16 w-16'}`}
      >
        <Icon size={large ? 38 : 30} strokeWidth={1.5} className="text-cyan-300" />
      </span>
    </div>
  );
}

/**
 * The date on a white badge that floats over the edge of a photo. Decorative:
 * the date is also given in words. `className` places it. It lets clicks
 * through, as on a card it sits above the card's stretched link.
 */
export function EngagementDateBadge({ leaf, className = '' }) {
  return (
    <div
      className={`pointer-events-none z-10 inline-flex min-w-[4.5rem] flex-col items-center rounded-xl border border-navy-100 bg-white px-3 py-2 text-center shadow-lg ${className}`}
      aria-hidden="true"
    >
      {leaf ? (
        <>
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">{leaf.month}</span>
          <span className="whitespace-nowrap text-2xl font-bold leading-tight text-navy-900">{leaf.days}</span>
          <span className="text-[11px] font-semibold text-navy-600">{leaf.year}</span>
        </>
      ) : (
        <>
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Dates</span>
          <span className="text-lg font-bold leading-tight text-navy-900">TBA</span>
        </>
      )}
    </div>
  );
}
