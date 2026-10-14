import { tabClass } from "./campaignStyles";

// Underline tab bar matching the section tabs on EventProfilePage.
// Each tab: { key, label, icon?, count?, disabled? }. `trailing` renders actions on the right.
export function TabIndicator({ active }) {
  return active ? (
    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-600 rounded-full" />
  ) : null;
}

export default function CampaignTabBar({
  tabs,
  value,
  onChange,
  label,
  trailing,
  className = "bg-white border-b border-navy-200",
}) {
  return (
    <nav aria-label={label} className={className}>
      <div className="flex items-center gap-2">
        <div role="tablist" className="flex gap-1 overflow-x-auto flex-1 min-w-0">
          {tabs.map(({ key, label: tabLabel, icon: Icon, disabled, count }) => {
            const active = value === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => onChange(key)}
                className={tabClass(active)}
              >
                {Icon && <Icon size={16} />}
                {tabLabel}
                {count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      active
                        ? "bg-cyan-50 text-cyan-700"
                        : "bg-navy-100 text-navy-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
                <TabIndicator active={active} />
              </button>
            );
          })}
        </div>
        {trailing && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 py-2 pr-2">
            {trailing}
          </div>
        )}
      </div>
    </nav>
  );
}
