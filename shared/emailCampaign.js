/** Event campaign constants, merge tags, and safe rendering helpers. */

export const CAMPAIGN_STATES = [
  'draft',
  'scheduled',
  'sending',
  'paused',
  'completed',
  'partially_failed',
  'failed',
  'cancelled',
  'archived',
];

export const CAMPAIGN_PURPOSES = {
  event_service: 'event_service',
  promotional: 'promotional',
};

export const ALLOWED_SEGMENT_FILTERS = [
  'status',
  'payment_status',
  'registration_type',
  'attended',
  'registered_from',
  'registered_to',
  'attendee_type',
  'include_cancelled',
];

export const CAMPAIGN_MERGE_TAGS = [
  { key: 'first_name', label: 'First name', fallback: 'there' },
  { key: 'full_name', label: 'Full name', fallback: 'Guest' },
  { key: 'event_title', label: 'Event title', required: true },
  { key: 'event_when', label: 'Event date and time' },
  { key: 'venue_or_join', label: 'Venue or joining link' },
  { key: 'registration_ref', label: 'Registration reference' },
  { key: 'resource_page_url', label: 'Resource page link' },
  { key: 'preferences_url', label: 'Preferences link' },
  { key: 'unsubscribe_url', label: 'Unsubscribe link' },
];

export const DEFAULT_CAMPAIGN_SENDER = {
  fromName: 'Mutale Mubanga',
  fromEmail: 'grow@mutalemubanga.org',
  replyTo: 'grow@mutalemubanga.org',
};

export const CAMPAIGN_STATE_TRANSITIONS = {
  draft: ['scheduled', 'sending', 'cancelled', 'archived'],
  scheduled: ['sending', 'paused', 'cancelled', 'draft'],
  sending: ['paused', 'completed', 'partially_failed', 'failed', 'cancelled'],
  paused: ['sending', 'cancelled'],
  completed: ['archived'],
  partially_failed: ['sending', 'cancelled', 'archived'],
  failed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

export function canTransitionCampaign(from, to) {
  const allowed = CAMPAIGN_STATE_TRANSITIONS[String(from || '')] || [];
  return allowed.includes(String(to || ''));
}

export function normalizeCampaignEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

export function sanitizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function stripHeaderInjection(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function renderMergeTemplate(template, vars = {}, { mode = 'text' } = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}\}/g, (_all, key, explicitFallback) => {
    const tag = CAMPAIGN_MERGE_TAGS.find((item) => item.key === key);
    const raw = vars[key];
    const hasValue = raw != null && String(raw).trim() !== '';
    const fallback = explicitFallback != null ? String(explicitFallback) : (tag?.fallback || '');
    const value = hasValue ? String(raw) : fallback;
    if (mode === 'html') return escapeHtml(value);
    if (mode === 'url') return encodeURIComponent(value);
    return value;
  });
}

export function missingRequiredMergeValues(template, vars = {}) {
  const missing = [];
  const keys = new Set();
  for (const match of String(template || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)) {
    keys.add(match[1]);
  }
  for (const key of keys) {
    const tag = CAMPAIGN_MERGE_TAGS.find((item) => item.key === key);
    if (!tag?.required) continue;
    if (vars[key] == null || String(vars[key]).trim() === '') missing.push(key);
  }
  return missing;
}

export function defaultSegment() {
  return {
    mode: 'all',
    registration_ids: [],
    filters: {
      status: ['confirmed'],
      payment_status: [],
      registration_type: [],
      attended: 'any',
      registered_from: '',
      registered_to: '',
      attendee_type: [],
      include_cancelled: false,
    },
  };
}

export function sanitizeSegment(raw = {}) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const base = defaultSegment();
  const mode = ['all', 'selected', 'filter'].includes(incoming.mode) ? incoming.mode : 'all';
  const filters = { ...base.filters, ...(incoming.filters && typeof incoming.filters === 'object' ? incoming.filters : {}) };
  const cleanedFilters = {};
  for (const key of ALLOWED_SEGMENT_FILTERS) {
    cleanedFilters[key] = filters[key];
  }
  return {
    mode,
    registration_ids: Array.isArray(incoming.registration_ids)
      ? incoming.registration_ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    filters: cleanedFilters,
  };
}

export function newCampaignId(prefix = 'ecmp') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const MARKETING_CONSENT_VERSION = '2026-10-growing-people-v1';
export const MARKETING_CONSENT_WORDING = 'I would like occasional updates about future Mutale events and programmes. This is optional and is not required to attend this event.';
