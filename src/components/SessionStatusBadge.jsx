import { SESSION_STATUS_META } from '../utils/eventSessions';

export default function SessionStatusBadge({ status }) {
  const meta = SESSION_STATUS_META[status] || SESSION_STATUS_META.upcoming;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
      style={{
        backgroundColor: meta.color,
        textShadow: '0 1px 1px rgba(20, 29, 69, 0.35)',
      }}
    >
      {meta.label}
    </span>
  );
}
