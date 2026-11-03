/**
 * Speaking engagements — shared by the API and the admin/public UI.
 *
 * Speaking engagements are a portfolio, not ticketed events: they live in their
 * own table and never touch registration, payment, or attendee messaging.
 */
import { safeExternalUrl } from './safeUrl.js';

export const DEFAULT_SPEAKING_TIMEZONE = 'Africa/Lusaka';

export const SPEAKING_EVENT_TYPES = [
  { value: 'conference', label: 'Conference' },
  { value: 'forum', label: 'Forum' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'summit', label: 'Summit' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'other', label: 'Other' },
];

export const SPEAKING_ROLES = [
  { value: 'keynote_speaker', label: 'Keynote speaker' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'panellist', label: 'Panellist' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'facilitator', label: 'Facilitator' },
  { value: 'trainer', label: 'Trainer' },
];

export const ATTENDANCE_FORMATS = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];

export const AUDIENCE_ACCESS_OPTIONS = [
  { value: 'public', label: 'Open to the public' },
  { value: 'invitation_only', label: 'Invitation only' },
  { value: 'unspecified', label: 'Not specified' },
];

export const PARTICIPATION_STATUSES = [
  { value: 'invited', label: 'Invited' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
];

export const SPEAKING_EVENT_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'postponed', label: 'Postponed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Approved material for an engagement, shown as separate actions on its card.
export const MEDIA_TYPES = [
  { value: 'recording', label: 'Recording', action: 'Watch recording' },
  { value: 'slides', label: 'Slides', action: 'View slides' },
  { value: 'photos', label: 'Photos', action: 'See photos' },
  { value: 'article', label: 'Article', action: 'Read article' },
];

export const PUBLICATION_STATES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'hidden', label: 'Hidden' },
];

const values = (options) => new Set(options.map((o) => o.value));
const EVENT_TYPE_VALUES = values(SPEAKING_EVENT_TYPES);
const ROLE_VALUES = values(SPEAKING_ROLES);
const FORMAT_VALUES = values(ATTENDANCE_FORMATS);
const ACCESS_VALUES = values(AUDIENCE_ACCESS_OPTIONS);
const PARTICIPATION_VALUES = values(PARTICIPATION_STATUSES);
const EVENT_STATUS_VALUES = values(SPEAKING_EVENT_STATUSES);
const MEDIA_TYPE_VALUES = values(MEDIA_TYPES);

export const ENGAGEMENT_LIMITS = {
  event_title: 255,
  organiser: 255,
  session_title: 255,
  description: 600,
  venue: 255,
  city: 120,
  country: 120,
  event_url: 2048,
  image_url: 1024,
  image_alt: 255,
  admin_notes: 5000,
  topic: 60,
  topics: 8,
  media_label: 80,
  media: 6,
};

export function isValidTimeZone(value) {
  const zone = String(value || '').trim();
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'on', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}:00`;
}

function parseRoles(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = list.split(',');
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((r) => String(r || '').trim()).filter(Boolean))];
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Topics arrive as a list or comma-separated text; duplicates are dropped regardless of case. */
function parseTopics(value) {
  let list = parseJsonList(value);
  if (typeof value === 'string') {
    const text = value.trim();
    // Stored lists are JSON; anything else (even typed text starting with "[") is comma-separated.
    if (!text.startsWith('[') || (list.length === 0 && text !== '[]')) list = text.split(',');
  }
  const seen = new Set();
  const topics = [];
  for (const item of list) {
    const topic = String(item || '').replace(/\s+/g, ' ').trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    topics.push(topic);
  }
  return topics;
}

/** Stored media items that are still safe to show: known type and an http(s) address. */
function parseMedia(value) {
  return parseJsonList(value)
    .map((item) => ({
      type: String(item?.type || ''),
      url: safeExternalUrl(item?.url),
      label: String(item?.label || '').trim() || null,
    }))
    .filter((item) => MEDIA_TYPE_VALUES.has(item.type) && item.url);
}

/** Uploaded images are site-relative; anything else must be a safe http(s) URL. */
function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/uploads\/[\w./-]+$/.test(raw) && !raw.includes('..')) return raw;
  return safeExternalUrl(raw);
}

/**
 * Validate admin input and return DB-ready columns.
 * Publication state is deliberately not accepted here: it only changes through
 * the explicit publish / hide actions.
 * @returns {{ value: object, errors: Record<string, string> }}
 */
export function normalizeEngagementInput(input = {}) {
  const errors = {};
  const text = (key) => {
    const v = String(input[key] ?? '').trim();
    const max = ENGAGEMENT_LIMITS[key];
    if (max && v.length > max) errors[key] = `Use ${max} characters or fewer.`;
    return v || null;
  };
  const choice = (key, allowed, fallback = null) => {
    const v = String(input[key] ?? '').trim();
    if (!v) return fallback;
    if (!allowed.has(v)) {
      errors[key] = 'Choose one of the listed options.';
      return fallback;
    }
    return v;
  };
  const date = (key) => {
    const v = String(input[key] ?? '').trim();
    if (!v) return null;
    if (!isValidDateOnly(v)) {
      errors[key] = 'Enter a valid date.';
      return null;
    }
    return v;
  };
  const time = (key) => {
    const v = String(input[key] ?? '').trim();
    if (!v) return null;
    const normalized = normalizeTime(v);
    if (!normalized) errors[key] = 'Enter a valid time (HH:MM).';
    return normalized;
  };

  const eventTitle = text('event_title');
  if (!eventTitle) errors.event_title = 'Event title is required.';

  const roles = parseRoles(input.roles);
  const unknownRole = roles.find((r) => !ROLE_VALUES.has(r));
  if (unknownRole) errors.roles = 'Choose roles from the listed options.';

  const startDate = date('start_date');
  const endDate = date('end_date');
  if (endDate && !startDate && !errors.end_date) errors.start_date = 'Add a start date before the end date.';
  if (startDate && endDate && endDate < startDate) errors.end_date = 'End date must be on or after the start date.';

  const datesTbc = toBoolean(input.dates_tbc);
  const sessionDate = date('session_date');
  const sessionStart = time('session_start_time');
  const sessionEnd = time('session_end_time');
  if ((sessionStart || sessionEnd) && !sessionDate && !errors.session_date) {
    errors.session_date = 'Add the session date for this time.';
  }
  // The public sections go by the event dates, so a session date alone would
  // leave the card under "Dates to be announced" after the talk has happened.
  if (sessionDate && !startDate && !datesTbc && !errors.start_date) {
    errors.start_date = 'Add the event start date. For a one-day event, use the session date.';
  } else if (sessionDate && startDate && !errors.end_date) {
    if (sessionDate < startDate || sessionDate > (endDate || startDate)) {
      errors.session_date = endDate
        ? 'The session date must fall between the event start and end dates.'
        : 'The session date must match the event date. Add an end date if the event runs over several days.';
    }
  }
  if (sessionEnd && !sessionStart && !errors.session_start_time) {
    errors.session_start_time = 'Add a start time before the end time.';
  }
  if (sessionStart && sessionEnd && sessionEnd < sessionStart) {
    errors.session_end_time = 'End time must be after the start time.';
  }

  const rawZone = String(input.timezone ?? '').trim();
  if (rawZone && !isValidTimeZone(rawZone)) errors.timezone = 'Choose a valid time zone.';
  const timezone = rawZone && isValidTimeZone(rawZone) ? rawZone : DEFAULT_SPEAKING_TIMEZONE;

  const rawUrl = String(input.event_url ?? '').trim();
  const eventUrl = rawUrl ? safeExternalUrl(rawUrl) : '';
  if (rawUrl && !eventUrl) errors.event_url = 'Use a full web address starting with http:// or https://.';
  else if (eventUrl.length > ENGAGEMENT_LIMITS.event_url) errors.event_url = 'This web address is too long.';

  const rawImage = String(input.image_url ?? '').trim();
  const imageUrl = normalizeImageUrl(rawImage);
  if (rawImage && !imageUrl) errors.image_url = 'Upload the image or use an http:// or https:// address.';
  else if (imageUrl.length > ENGAGEMENT_LIMITS.image_url) errors.image_url = 'This web address is too long.';
  const imageAlt = text('image_alt');
  if (imageUrl && !imageAlt && !errors.image_alt) errors.image_alt = 'Describe the image for people using screen readers.';

  const topics = parseTopics(input.topics);
  if (topics.length > ENGAGEMENT_LIMITS.topics) errors.topics = `Use up to ${ENGAGEMENT_LIMITS.topics} topics.`;
  else if (topics.some((t) => t.length > ENGAGEMENT_LIMITS.topic)) {
    errors.topics = `Keep each topic to ${ENGAGEMENT_LIMITS.topic} characters.`;
  }

  // Rows left completely empty in the form are ignored rather than rejected.
  // Rows keep their position, so messages name the row the admin sees.
  const mediaRows = parseJsonList(input.media)
    .map((item, position) => ({
      position,
      type: String(item?.type || '').trim(),
      url: String(item?.url || '').trim(),
      label: String(item?.label || '').trim(),
    }))
    .filter((item) => item.url || item.label);
  const media = [];
  // The first problem is reported twice: on the row's own field (media_url_2,
  // which the form highlights and focuses) and as a sentence for the list.
  const mediaProblem = (item, field, message) => {
    if (errors.media) return;
    errors[`media_${field}_${item.position}`] = message;
    errors.media = `Link ${item.position + 1}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
  };
  mediaRows.forEach((item) => {
    const url = safeExternalUrl(item.url);
    if (!MEDIA_TYPE_VALUES.has(item.type)) mediaProblem(item, 'type', 'Choose what it is.');
    else if (!url) mediaProblem(item, 'url', 'Use a full web address starting with http:// or https://.');
    else if (url.length > ENGAGEMENT_LIMITS.event_url) mediaProblem(item, 'url', 'This web address is too long.');
    else if (item.label.length > ENGAGEMENT_LIMITS.media_label) {
      mediaProblem(item, 'label', `Keep the label to ${ENGAGEMENT_LIMITS.media_label} characters.`);
    } else media.push({ type: item.type, url, label: item.label || null });
  });
  if (mediaRows.length > ENGAGEMENT_LIMITS.media) errors.media = `Add up to ${ENGAGEMENT_LIMITS.media} links.`;

  const value = {
    event_title: eventTitle,
    organiser: text('organiser'),
    event_type: choice('event_type', EVENT_TYPE_VALUES),
    roles_json: JSON.stringify(roles.filter((r) => ROLE_VALUES.has(r))),
    session_title: text('session_title'),
    description: text('description'),
    start_date: startDate,
    end_date: endDate,
    dates_tbc: datesTbc ? 1 : 0,
    session_date: sessionDate,
    session_start_time: sessionStart,
    session_end_time: sessionEnd,
    timezone,
    attendance_format: choice('attendance_format', FORMAT_VALUES),
    venue: text('venue'),
    city: text('city'),
    country: text('country'),
    audience_access: choice('audience_access', ACCESS_VALUES, 'unspecified'),
    event_url: eventUrl || null,
    image_url: imageUrl || null,
    image_alt: imageUrl ? imageAlt : null,
    participation_status: choice('participation_status', PARTICIPATION_VALUES, 'invited'),
    event_status: choice('event_status', EVENT_STATUS_VALUES, 'scheduled'),
    featured: toBoolean(input.featured) ? 1 : 0,
    topics_json: JSON.stringify(topics.slice(0, ENGAGEMENT_LIMITS.topics)),
    media_json: JSON.stringify(media),
    admin_notes: text('admin_notes'),
  };

  return { value, errors };
}

/** The only rule for what the public may see. Declined stays private even if published. */
export function isPubliclyVisible(row) {
  return row?.publication_state === 'published' && row?.participation_status !== 'declined';
}

/** Today's date (YYYY-MM-DD) as seen in the given time zone. */
export function todayInTimeZone(timeZone = DEFAULT_SPEAKING_TIMEZONE, now = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SPEAKING_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Decide which public section an engagement belongs to, using the event's own
 * time zone. Date-only values are compared as dates; no times are invented.
 * A past cancellation gets its own section, so it never sits among the
 * engagements that took place.
 * @returns {{ section: 'upcoming' | 'previous' | 'cancelled' | 'tba', inProgress: boolean }}
 */
export function classifyEngagement(engagement, now = new Date()) {
  const start = engagement?.start_date || '';
  if (Number(engagement?.dates_tbc) === 1 || engagement?.dates_tbc === true || !start) {
    return { section: 'tba', inProgress: false };
  }
  const today = todayInTimeZone(engagement.timezone, now);
  const last = engagement.end_date || start;
  if (last < today) {
    return { section: engagement.event_status === 'cancelled' ? 'cancelled' : 'previous', inProgress: false };
  }
  const running = start <= today && (engagement.event_status || 'scheduled') === 'scheduled';
  return { section: 'upcoming', inProgress: running };
}

/**
 * Split engagements into the public sections and sort each one:
 * upcoming — in progress first, then nearest start date;
 * previous and cancelled — most recent first; tba — most recently updated first.
 */
export function groupEngagements(rows = [], now = new Date()) {
  const groups = { upcoming: [], previous: [], cancelled: [], tba: [] };
  for (const row of rows) {
    const { section, inProgress } = classifyEngagement(row, now);
    groups[section].push({ row, inProgress });
  }
  const byTitle = (a, b) => String(a.row.event_title || '').localeCompare(String(b.row.event_title || ''));
  const lastDay = (item) => item.row.end_date || item.row.start_date || '';

  groups.upcoming.sort((a, b) => (Number(b.inProgress) - Number(a.inProgress))
    || String(a.row.start_date).localeCompare(String(b.row.start_date))
    || byTitle(a, b));
  groups.previous.sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || byTitle(a, b));
  groups.cancelled.sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || byTitle(a, b));
  groups.tba.sort((a, b) => String(b.row.updated_at || '').localeCompare(String(a.row.updated_at || '')) || byTitle(a, b));
  return groups;
}

/**
 * Public shape of an engagement — an explicit whitelist, so private columns
 * (admin notes, audit fields, anything added later) never leak by default.
 */
export function toPublicEngagement(row, { inProgress = false, section } = {}) {
  const tbc = Number(row.dates_tbc) === 1 || row.dates_tbc === true;
  const imageUrl = normalizeImageUrl(row.image_url);
  return {
    id: row.id,
    event_title: row.event_title,
    organiser: row.organiser || null,
    event_type: row.event_type || null,
    roles: parseRoles(row.roles_json ?? row.roles).filter((r) => ROLE_VALUES.has(r)),
    session_title: row.session_title || null,
    description: row.description || null,
    dates_tbc: tbc,
    start_date: tbc ? null : row.start_date || null,
    end_date: tbc ? null : row.end_date || null,
    session_date: tbc ? null : row.session_date || null,
    session_start_time: tbc ? null : row.session_start_time || null,
    session_end_time: tbc ? null : row.session_end_time || null,
    timezone: row.timezone || DEFAULT_SPEAKING_TIMEZONE,
    attendance_format: row.attendance_format || null,
    venue: row.venue || null,
    city: row.city || null,
    country: row.country || null,
    audience_access: row.audience_access || 'unspecified',
    event_url: safeExternalUrl(row.event_url) || null,
    image_url: imageUrl || null,
    image_alt: imageUrl ? row.image_alt || '' : null,
    participation_status: row.participation_status,
    event_status: row.event_status || 'scheduled',
    featured: Number(row.featured) === 1 || row.featured === true,
    topics: parseTopics(row.topics_json ?? row.topics),
    media: parseMedia(row.media_json ?? row.media),
    section: section || classifyEngagement(row).section,
    in_progress: Boolean(inProgress),
  };
}

// ── Display helpers ──────────────────────────────────────────────────────────
// Dates are formatted from their YYYY-MM-DD parts, never through Date objects,
// so a visitor's own time zone can't shift a date-only engagement.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ALL_OPTIONS = [
  ...SPEAKING_EVENT_TYPES, ...SPEAKING_ROLES, ...ATTENDANCE_FORMATS, ...AUDIENCE_ACCESS_OPTIONS,
];

export function optionLabel(options, value) {
  return (options || ALL_OPTIONS).find((o) => o.value === value)?.label || '';
}

function dateParts(value) {
  if (!isValidDateOnly(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return { year: y, month: m, day: d, short: MONTHS[m - 1].slice(0, 3), long: MONTHS[m - 1] };
}

/**
 * A calendar leaf for a card: the month band, the day or days, and the year,
 * e.g. { month: 'Nov', days: '06–11', year: '2026' }, or across months
 * { month: 'Nov – Dec', days: '28–02', year: '2026' }.
 * Returns null when the dates are to be announced.
 */
export function formatEngagementDateLeaf(engagement) {
  if (engagement?.dates_tbc) return null;
  const start = dateParts(engagement?.start_date);
  if (!start) return null;
  const end = dateParts(engagement?.end_date) || start;
  const pad = (n) => String(n).padStart(2, '0');
  const sameMonth = start.year === end.year && start.month === end.month;
  const sameDay = sameMonth && start.day === end.day;
  return {
    month: sameMonth ? start.short : `${start.short} – ${end.short}`,
    days: sameDay ? pad(start.day) : `${pad(start.day)}–${pad(end.day)}`,
    year: start.year === end.year ? String(start.year) : `${start.year}–${String(end.year).slice(-2)}`,
  };
}

/** Full readable range, e.g. "6–11 November 2026" or "30 December 2026 – 2 January 2027". */
export function formatEngagementDateRange(engagement) {
  if (engagement?.dates_tbc) return 'Dates to be announced';
  const start = dateParts(engagement?.start_date);
  if (!start) return 'Dates to be announced';
  const end = dateParts(engagement?.end_date);
  if (!end || engagement.end_date === engagement.start_date) return `${start.day} ${start.long} ${start.year}`;
  if (start.year === end.year && start.month === end.month) return `${start.day}–${end.day} ${start.long} ${start.year}`;
  if (start.year === end.year) return `${start.day} ${start.long} – ${end.day} ${end.long} ${start.year}`;
  return `${start.day} ${start.long} ${start.year} – ${end.day} ${end.long} ${end.year}`;
}

function timeZoneLabel(timeZone, dateValue) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SPEAKING_TIMEZONE;
  try {
    const at = new Date(`${dateValue}T12:00:00Z`);
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName');
    return part?.value || zone;
  } catch {
    return zone;
  }
}

/** "Session: 7 Nov 2026, 09:30–10:15 (GMT+8)" — null when no session date is set. */
export function formatSessionTime(engagement) {
  if (engagement?.dates_tbc) return null;
  const day = dateParts(engagement?.session_date);
  if (!day) return null;
  const hhmm = (t) => String(t || '').slice(0, 5);
  let text = `${day.day} ${day.short} ${day.year}`;
  if (engagement.session_start_time) {
    text += `, ${hhmm(engagement.session_start_time)}`;
    if (engagement.session_end_time) text += `–${hhmm(engagement.session_end_time)}`;
    text += ` (${timeZoneLabel(engagement.timezone, engagement.session_date)})`;
  }
  return text;
}

/** "Livingstone, Zambia", "Online", or "Lusaka, Zambia · Hybrid"; null when nothing is known. */
export function formatEngagementLocation(engagement) {
  const place = [engagement?.venue, engagement?.city, engagement?.country]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  if (engagement?.attendance_format === 'online') return place ? `Online · ${place}` : 'Online';
  if (engagement?.attendance_format === 'hybrid') return place ? `${place} · Hybrid` : 'Hybrid';
  return place || null;
}

/** The label on a media action, e.g. "Watch recording", unless the admin wrote one. */
export function mediaActionLabel(item) {
  return item?.label || MEDIA_TYPES.find((t) => t.value === item?.type)?.action || 'Open link';
}

export function formatRoles(roles = []) {
  return (Array.isArray(roles) ? roles : [])
    .map((role) => optionLabel(SPEAKING_ROLES, role))
    .filter(Boolean)
    .join(' · ');
}

/**
 * What the public card would show for an admin record or unsaved form values.
 * Runs the same validation and whitelist as the API, so an invalid URL is
 * previewed as no link, exactly as it would (not) be saved.
 */
export function previewEngagement(input = {}, now = new Date()) {
  const { value } = normalizeEngagementInput(input);
  const row = { id: input.id || 'preview', ...value, event_title: value.event_title || 'Untitled engagement' };
  return toPublicEngagement(row, classifyEngagement(row, now));
}

export const SECTION_TITLES = {
  upcoming: 'Upcoming Engagements',
  previous: 'Previous Engagements',
  cancelled: 'Cancelled engagements',
  tba: 'Dates to be announced',
};
