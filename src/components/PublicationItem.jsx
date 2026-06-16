import { ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PublicationItem({ pub }) {
  return (
    <Link
      to={`/publications/${pub.id}`}
      className="block bg-white rounded-2xl border border-navy-100 p-6 hover:shadow-lg hover:border-cyan-200 transition-all duration-300 group"
      aria-label={`Open publication details: ${pub.title}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 mt-0.5">
          <Search size={18} />
        </div>
        <div>
          <div className="flex items-start gap-2">
            <h3 className="text-base font-bold text-navy-900 mb-1 leading-snug group-hover:text-cyan-700 transition-colors break-words">
              {pub.title}
            </h3>
            <ChevronRight size={14} className="mt-0.5 text-navy-400 group-hover:text-cyan-600 transition-colors" />
          </div>
          <p className="text-sm text-navy-600 mb-1 break-words">{pub.authors}</p>
          <p className="text-sm text-navy-400 italic break-words">
            {pub.journal}, {pub.volume} ({pub.year})
          </p>
          {pub.abstract && (
            <p className="text-sm text-navy-500 mt-3 leading-relaxed line-clamp-4">{pub.abstract}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
