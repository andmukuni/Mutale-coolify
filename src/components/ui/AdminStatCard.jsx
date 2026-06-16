import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export default function AdminStatCard({
  label,
  value,
  icon,
  subtitle,
  color = 'cyan',
  to,
  loading = false,
  animationDelay = 0,
}) {
  const colorMap = {
    cyan: 'bg-cyan-50 text-cyan-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    navy: 'bg-navy-100 text-navy-600',
  };

  const IconComponent = icon;
  const isNumericValue = useMemo(() => {
    if (typeof value === 'number') return true;
    if (typeof value === 'string') return /^\d+(\.\d+)?$/.test(value.trim());
    return false;
  }, [value]);

  const targetNumber = Number(value || 0);
  const [displayNumber, setDisplayNumber] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!isNumericValue) return;

    let rafId;
    const duration = 900;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      setDisplayNumber(Math.round(targetNumber * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isNumericValue, targetNumber, value]);

  const displayValue = isNumericValue ? displayNumber : value;

  const content = (
    <div
      className={`h-full min-h-[220px] bg-white rounded-2xl border border-navy-100 p-5 hover:shadow-md transition-all duration-500 ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      style={{ transitionDelay: `${animationDelay}ms` }}
    >
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-10 bg-navy-100 rounded-xl" />
          <div className="h-4 bg-navy-100 rounded w-1/2" />
          <div className="h-7 bg-navy-100 rounded w-1/3" />
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            {IconComponent && (
              <div className={`p-2.5 rounded-xl ${colorMap[color] || colorMap.cyan}`}>
                <IconComponent size={20} />
              </div>
            )}
          </div>
          <div className="text-2xl font-bold text-navy-900 tabular-nums">{displayValue}</div>
          <div className="text-sm text-navy-500 mt-0.5">{label}</div>
          {subtitle && (
            <div className="text-xs text-navy-400 mt-1 min-h-[2.5rem] line-clamp-2">{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return <Link to={to} className="block h-full">{content}</Link>;
  }

  return content;
}
