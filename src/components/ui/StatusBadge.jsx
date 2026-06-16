const colorMap = {
  upcoming: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/20' },
  ongoing: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20' },
  completed: { bg: 'bg-navy-50', text: 'text-navy-600', ring: 'ring-navy-500/20' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20' },
  featured: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/20' },
  draft: { bg: 'bg-navy-50', text: 'text-navy-500', ring: 'ring-navy-500/20' },
  published: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20' },
  // booking statuses
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20' },
  attended: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/20' },
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-600/20' },
  waitlisted: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/20' },
  // event display statuses
  past: { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-400/20' },
  closed: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/20' },
  // payment statuses
  paid: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20' },
  unpaid: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20' },
  not_required: { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-500/20' },
  free: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/20' },
  waived: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/20' },
  default: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/20' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const normalized = status?.toLowerCase() || 'default';
  const colors = colorMap[normalized] || colorMap.default;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses[size]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
      {status}
    </span>
  );
}
