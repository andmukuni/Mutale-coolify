import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
}) {
  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-navy-400 mb-2 overflow-x-auto whitespace-nowrap pb-1">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight size={14} className="text-navy-300" />}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="hover:text-cyan-600 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-navy-600 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-navy-400 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
