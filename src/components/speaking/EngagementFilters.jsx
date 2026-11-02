import { X } from 'lucide-react';
import { NO_FILTERS, hasActiveFilters } from './engagementFilterRules';

function FilterSelect({ id, label, value, onChange, options, allLabel }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-navy-600">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-navy-200 bg-white px-2 py-2 text-sm sm:px-3 text-navy-800 focus:border-cyan-700 focus:outline-hidden focus:ring-2 focus:ring-cyan-700 dark:focus:ring-cyan-400"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function EngagementFilters({ options, filters, onChange, shown }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const active = hasActiveFilters(filters);
  return (
    <div role="search" aria-label="Filter speaking engagements" className="rounded-2xl border border-navy-100 bg-white p-3 sm:p-4">
      {/* One row on wider screens, so the filters don't push the listings down. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
        <FilterSelect
          id="speaking-filter-year"
          label="Year"
          value={filters.year}
          onChange={set('year')}
          options={options.years.map((y) => ({ value: y, label: y }))}
          allLabel="All years"
        />
        <FilterSelect
          id="speaking-filter-role"
          label="Role"
          value={filters.role}
          onChange={set('role')}
          options={options.roles}
          allLabel="All roles"
        />
        {options.topics.length > 0 && (
          <FilterSelect
            id="speaking-filter-topic"
            label="Topic"
            value={filters.topic}
            onChange={set('topic')}
            options={options.topics.map((t) => ({ value: t, label: t }))}
            allLabel="All topics"
          />
        )}
        <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-end sm:gap-0">
        <p className="text-sm text-navy-600 sm:whitespace-nowrap" aria-live="polite">
          {active ? `Showing ${shown} of ${options.total} engagements` : `${options.total} engagements`}
        </p>
        {active && (
          <button
            type="button"
            onClick={() => {
              onChange(NO_FILTERS);
              // This button disappears once nothing is filtered; keep focus in the filters.
              requestAnimationFrame(() => document.getElementById('speaking-filter-year')?.focus());
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
          >
            <X size={14} aria-hidden="true" />
            Clear filters
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
