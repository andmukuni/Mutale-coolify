export default function Card({
  title,
  subtitle,
  actions,
  children,
  footer,
  noPadding = false,
  className = '',
}) {
  return (
    <div className={`bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-100">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-navy-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={noPadding ? '' : 'p-6'}>{children}</div>

      {footer && (
        <div className="px-6 py-3 bg-navy-50 border-t border-navy-100">
          {footer}
        </div>
      )}
    </div>
  );
}
