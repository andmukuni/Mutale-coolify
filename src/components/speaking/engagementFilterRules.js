import { SPEAKING_ROLES } from '../../../shared/speakingEngagements.js';

/** Filters appear only once the archive is large enough to need them (brief §9). */
export const FILTER_THRESHOLD = 6;
export const NO_FILTERS = { year: '', role: '', topic: '' };
export const SECTION_KEYS = ['upcoming', 'tba', 'previous', 'cancelled'];

const yearsOf = (e) => [e.start_date, e.end_date]
  .map((d) => String(d || '').slice(0, 4))
  .filter((y) => /^\d{4}$/.test(y));

/** The choices that actually occur in the published engagements. */
export function filterOptions(groups = {}) {
  const all = SECTION_KEYS.flatMap((key) => groups[key] || []);
  const years = new Set();
  const roles = new Set();
  const topics = new Map();
  for (const e of all) {
    yearsOf(e).forEach((y) => years.add(y));
    (e.roles || []).forEach((r) => roles.add(r));
    (e.topics || []).forEach((t) => { if (!topics.has(t.toLowerCase())) topics.set(t.toLowerCase(), t); });
  }
  return {
    total: all.length,
    years: [...years].sort((a, b) => b.localeCompare(a)),
    roles: SPEAKING_ROLES.filter((r) => roles.has(r.value)),
    topics: [...topics.values()].sort((a, b) => a.localeCompare(b)),
  };
}

export function hasActiveFilters(filters) {
  return Boolean(filters.year || filters.role || filters.topic);
}

/** Same groups, keeping only the engagements that match every chosen filter. */
export function applyFilters(groups = {}, filters = NO_FILTERS) {
  const topic = filters.topic.toLowerCase();
  const matches = (e) => (!filters.year || yearsOf(e).includes(filters.year))
    && (!filters.role || (e.roles || []).includes(filters.role))
    && (!topic || (e.topics || []).some((t) => t.toLowerCase() === topic));
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, (groups[key] || []).filter(matches)]));
}
