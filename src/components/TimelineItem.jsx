import { Briefcase, MapPin, Calendar } from 'lucide-react';

export default function TimelineItem({ role, organization, project, location, startDate, endDate, responsibilities }) {
  const items = Array.isArray(responsibilities) ? responsibilities : [];

  return (
    <div className="relative pl-8 pb-10 border-l-2 border-navy-200 last:border-l-0 last:pb-0 group">
      {/* Dot */}
      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-cyan-500 border-2 border-white group-hover:bg-cyan-400 transition-colors" />

      <div className="bg-white rounded-2xl border border-navy-100 p-6 hover:shadow-lg transition-all duration-300">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-lg font-bold text-navy-900">{role}</h3>
            <div className="flex items-center gap-1.5 text-cyan-600 font-medium text-sm mt-0.5">
              <Briefcase size={14} />
              {organization}
            </div>
            {project && (
              <p className="text-xs text-navy-500 mt-1 italic">{project}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-navy-400">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {startDate} – {endDate}
            </span>
            {location && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {location}
              </span>
            )}
          </div>
        </div>

        <ul className="space-y-2 mt-4">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-navy-600 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
