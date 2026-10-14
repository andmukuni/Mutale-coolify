// Pill tabs matching the admin pattern used on NotificationTemplatesPage.
export default function CampaignTabs({
  tabs,
  value,
  onChange,
  label,
  className = "",
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {tabs.map(({ key, label: tabLabel, icon: Icon, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              active
                ? "bg-cyan-600 text-white border-cyan-600"
                : "bg-white text-navy-700 border-navy-200 hover:bg-navy-50"
            }`}
          >
            {Icon && <Icon size={15} />}
            {tabLabel}
            {count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? "bg-white/20" : "bg-navy-100 text-navy-600"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
