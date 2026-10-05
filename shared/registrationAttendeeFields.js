/**
 * Shared registration-response catalog for the admin attendees table and exports.
 * Source of truth: BookingModal / walk-in fields plus stored event_registrations columns.
 * Table cells and export cells must use these getters so they cannot silently diverge.
 */

export const VALUE_KIND = {
  MISSING: 'missing',
  NA: 'na',
  NO: 'no',
  VALUE: 'value',
};

export const COLUMN_PREFS_KEY = 'mm_attendee_columns_v1';

const SECRET_KEY_PATTERN = /password|passwd|secret|token|otp|cvv|cvc|credential|hash|authorization|bearer/i;

const SECRET_KEYS = new Set([
  'password',
  'password_hash',
  'verification_token',
  'password_reset_token_hash',
  'payment_credentials',
  'card_number',
  'card_cvv',
]);

const SKIP_EXTRA_KEYS = new Set([
  'id',
  'user_id',
  'coupon_id',
  'has_attended',
  'in_meeting',
  'in_meeting_at',
  'left_meeting_at',
  'account_phone',
  'current_marketing_opt_in',
]);

export function isSecretFieldKey(key = '') {
  const name = String(key || '');
  return SECRET_KEYS.has(name) || SECRET_KEY_PATTERN.test(name);
}

export function isSelfTicket(row = {}) {
  return String(row?.attendee_slot_key || '').trim() === '__self__'
    || !String(row?.booked_for_name || '').trim();
}

export function isChildAttendee(row = {}) {
  return String(row?.attendee_type || '').trim().toLowerCase() === 'child';
}

export function hasAttended(row = {}) {
  return Boolean(row?.attended_at) || String(row?.status || '').toLowerCase() === 'attended';
}

export function trimPhoneText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function missing() {
  return { kind: VALUE_KIND.MISSING, raw: null, display: '' };
}

function notApplicable() {
  return { kind: VALUE_KIND.NA, raw: null, display: 'Not applicable' };
}

function explicitNo(raw = false) {
  return { kind: VALUE_KIND.NO, raw, display: 'No' };
}

function present(raw, display = raw) {
  return { kind: VALUE_KIND.VALUE, raw, display: display == null ? '' : String(display) };
}

function textOrMissing(value) {
  if (value == null) return missing();
  const text = String(value).trim();
  if (!text) return missing();
  return present(value, text);
}

function phoneOrMissing(value) {
  const text = trimPhoneText(value);
  if (!text) return missing();
  return { kind: VALUE_KIND.VALUE, raw: text, display: text, type: 'phone' };
}

function titleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function humanizeFieldKey(key = '') {
  return titleCase(String(key || '').replace(/^extra:/, '')) || String(key || '');
}

export function formatYesNo(value) {
  if (value == null || value === '') return missing();
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'no') {
    return explicitNo(value);
  }
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'yes') {
    return present(value, 'Yes');
  }
  return textOrMissing(value);
}

export function formatListAnswer(value) {
  if (value == null || value === '') return missing();
  if (Array.isArray(value)) {
    if (!value.length) return missing();
    return present(value, value.map((item) => String(item)).join(', '));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return formatListAnswer(parsed);
      } catch {
        // keep original text
      }
    }
    return present(value, trimmed);
  }
  return present(value, String(value));
}

export function formatDateOnly(value) {
  if (value == null || value === '') return missing();
  const text = String(value).trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return present(value, dateOnly[1]);
  return textOrMissing(text);
}

export function formatSystemTimestamp(value) {
  if (value == null || value === '') return missing();
  const text = String(value).trim();
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T') + (text.endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return present(value, text);
  const iso = parsed.toISOString();
  return present(value, `${iso.slice(0, 19).replace('T', ' ')} UTC`);
}

export function formatMoney(value) {
  if (value == null || value === '') return missing();
  const amount = Number(value);
  if (!Number.isFinite(amount)) return textOrMissing(value);
  return present(value, amount.toFixed(2));
}

function formatAge(row) {
  const raw = row?.attendee_age;
  if (raw === 0 || raw === '0') return present(0, '0');
  if (raw != null && raw !== '') {
    return present(raw, String(raw));
  }
  return isChildAttendee(row) ? missing() : notApplicable();
}

function formatRelation(row) {
  const raw = row?.booked_for_relation;
  if (raw != null && String(raw).trim()) return present(raw, titleCase(raw));
  return isSelfTicket(row) ? notApplicable() : missing();
}

function formatGuardianPhone(row) {
  const phone = trimPhoneText(row?.guardian_phone);
  if (phone) return { kind: VALUE_KIND.VALUE, raw: phone, display: phone, type: 'phone' };
  return isChildAttendee(row) ? missing() : notApplicable();
}

function attendeeName(row) {
  return textOrMissing(row?.booked_for_name || row?.user_name);
}

function attendeeEmail(row) {
  if (!isSelfTicket(row)) return textOrMissing(row?.booked_for_email);
  return textOrMissing(row?.booked_for_email || row?.user_email);
}

function attendeePhone(row) {
  const guestPhone = trimPhoneText(row?.booked_for_phone);
  if (guestPhone) return { kind: VALUE_KIND.VALUE, raw: guestPhone, display: guestPhone, type: 'phone' };
  if (isSelfTicket(row)) return phoneOrMissing(row?.buyer_phone);
  return missing();
}

function ticketRole(row) {
  if (String(row?.notes || '').trim() === 'walk_in' || String(row?.payment_method || '') === 'walk_in') {
    return present('walk_in', 'Walk-in');
  }
  return present(isSelfTicket(row) ? 'self' : 'guest', isSelfTicket(row) ? 'Self' : 'Guest');
}

function uploadDisplay(value) {
  if (value == null || value === '') return missing();
  if (typeof value === 'object') {
    const filename = value.filename || value.name || value.originalname || '';
    const ref = value.admin_url || value.url || value.reference || value.id || '';
    const parts = [filename, ref].map((part) => String(part || '').trim()).filter(Boolean);
    if (!parts.length) return missing();
    return present(value, parts.join(' — '));
  }
  return textOrMissing(value);
}

export const BASE_ATTENDEE_FIELDS = [
  {
    id: 'attendee_name',
    label: 'Attendee name',
    group: 'form',
    type: 'text',
    sticky: true,
    minWidth: 180,
    sourceKeys: ['booked_for_name', 'user_name'],
    get: attendeeName,
  },
  {
    id: 'attendee_email',
    label: 'Attendee email',
    group: 'form',
    type: 'text',
    minWidth: 200,
    sourceKeys: ['booked_for_email'],
    get: attendeeEmail,
  },
  {
    id: 'attendee_phone',
    label: 'Attendee phone',
    group: 'form',
    type: 'phone',
    minWidth: 150,
    sourceKeys: ['booked_for_phone'],
    get: attendeePhone,
  },
  {
    id: 'attendee_type',
    label: 'Attendee type',
    group: 'form',
    type: 'choice',
    minWidth: 120,
    sourceKeys: ['attendee_type'],
    get: (row) => {
      const raw = String(row?.attendee_type || '').trim();
      if (!raw) return isSelfTicket(row) ? present('adult', 'Adult') : missing();
      return present(raw, titleCase(raw));
    },
  },
  {
    id: 'attendee_sex',
    label: 'Sex',
    group: 'form',
    type: 'choice',
    minWidth: 100,
    sourceKeys: ['attendee_sex'],
    get: (row) => {
      const raw = String(row?.attendee_sex || '').trim();
      return raw ? present(raw, titleCase(raw)) : missing();
    },
  },
  {
    id: 'attendee_age',
    label: 'Age',
    group: 'form',
    type: 'number',
    minWidth: 80,
    sourceKeys: ['attendee_age'],
    get: formatAge,
  },
  {
    id: 'booked_for_relation',
    label: 'Relation',
    group: 'form',
    type: 'choice',
    minWidth: 120,
    sourceKeys: ['booked_for_relation'],
    get: formatRelation,
  },
  {
    id: 'guardian_phone',
    label: 'Guardian phone',
    group: 'form',
    type: 'phone',
    minWidth: 150,
    sourceKeys: ['guardian_phone'],
    get: formatGuardianPhone,
  },
  {
    id: 'notes',
    label: 'Notes',
    group: 'form',
    type: 'longtext',
    minWidth: 220,
    truncate: 80,
    sourceKeys: ['notes'],
    get: (row) => textOrMissing(row?.notes),
  },
  {
    id: 'marketing_opt_in',
    label: 'Marketing opt-in (at registration)',
    group: 'form',
    type: 'checkbox',
    minWidth: 170,
    sourceKeys: ['marketing_opt_in'],
    get: (row) => formatYesNo(row?.marketing_opt_in),
  },
  {
    id: 'payer_name',
    label: 'Booking contact name',
    group: 'form',
    type: 'text',
    minWidth: 170,
    sourceKeys: ['user_name'],
    get: (row) => textOrMissing(row?.user_name),
  },
  {
    id: 'payer_email',
    label: 'Booking contact email',
    group: 'form',
    type: 'text',
    minWidth: 200,
    sourceKeys: ['user_email'],
    get: (row) => textOrMissing(row?.user_email),
  },
  {
    id: 'buyer_phone',
    label: 'Buyer phone (at registration)',
    group: 'form',
    type: 'phone',
    minWidth: 160,
    sourceKeys: ['buyer_phone'],
    get: (row) => phoneOrMissing(row?.buyer_phone),
  },
  {
    id: 'ticket_role',
    label: 'Ticket role',
    group: 'admin',
    type: 'choice',
    minWidth: 110,
    sourceKeys: ['attendee_slot_key'],
    get: ticketRole,
  },
  {
    id: 'reference_code',
    label: 'Reference',
    group: 'admin',
    type: 'text',
    minWidth: 140,
    sourceKeys: ['reference_code'],
    get: (row) => textOrMissing(row?.reference_code),
  },
  {
    id: 'registration_type',
    label: 'Registration type',
    group: 'admin',
    type: 'choice',
    minWidth: 140,
    sourceKeys: ['registration_type'],
    get: (row) => {
      const raw = String(row?.registration_type || '').trim();
      return raw ? present(raw, titleCase(raw)) : missing();
    },
  },
  {
    id: 'status',
    label: 'Status',
    group: 'admin',
    type: 'choice',
    minWidth: 120,
    sourceKeys: ['status'],
    get: (row) => textOrMissing(row?.status),
  },
  {
    id: 'payment_status',
    label: 'Payment status',
    group: 'admin',
    type: 'choice',
    minWidth: 130,
    sourceKeys: ['payment_status'],
    get: (row) => textOrMissing(row?.payment_status),
  },
  {
    id: 'payment_method',
    label: 'Payment method',
    group: 'admin',
    type: 'text',
    minWidth: 140,
    sourceKeys: ['payment_method'],
    get: (row) => {
      const raw = String(row?.payment_method || '').trim();
      return raw ? present(raw, raw.replace(/_/g, ' ')) : missing();
    },
  },
  {
    id: 'payment_reference',
    label: 'Payment reference',
    group: 'admin',
    type: 'text',
    minWidth: 160,
    sourceKeys: ['payment_reference'],
    get: (row) => textOrMissing(row?.payment_reference),
  },
  {
    id: 'amount',
    label: 'Amount',
    group: 'admin',
    type: 'number',
    minWidth: 100,
    sourceKeys: ['amount'],
    get: (row) => formatMoney(row?.amount),
  },
  {
    id: 'currency',
    label: 'Currency',
    group: 'admin',
    type: 'text',
    minWidth: 90,
    sourceKeys: ['currency'],
    get: (row) => textOrMissing(row?.currency),
  },
  {
    id: 'amount_zmw',
    label: 'Amount (ZMW)',
    group: 'admin',
    type: 'number',
    minWidth: 120,
    sourceKeys: ['amount_zmw'],
    get: (row) => formatMoney(row?.amount_zmw),
  },
  {
    id: 'coupon_code',
    label: 'Coupon',
    group: 'admin',
    type: 'text',
    minWidth: 110,
    sourceKeys: ['coupon_code'],
    get: (row) => textOrMissing(row?.coupon_code),
  },
  {
    id: 'list_price_zmw',
    label: 'List price (ZMW)',
    group: 'admin',
    type: 'number',
    minWidth: 130,
    sourceKeys: ['list_price_zmw'],
    get: (row) => formatMoney(row?.list_price_zmw),
  },
  {
    id: 'discount_zmw',
    label: 'Coupon discount (ZMW)',
    group: 'admin',
    type: 'number',
    minWidth: 150,
    sourceKeys: ['discount_zmw'],
    get: (row) => formatMoney(row?.discount_zmw),
  },
  {
    id: 'volume_discount_zmw',
    label: 'Volume discount (ZMW)',
    group: 'admin',
    type: 'number',
    minWidth: 160,
    sourceKeys: ['volume_discount_zmw'],
    get: (row) => formatMoney(row?.volume_discount_zmw),
  },
  {
    id: 'registered_at',
    label: 'Registered at (UTC)',
    group: 'admin',
    type: 'timestamp',
    minWidth: 180,
    sourceKeys: ['registered_at'],
    get: (row) => formatSystemTimestamp(row?.registered_at),
  },
  {
    id: 'attended_at',
    label: 'First joined at (UTC)',
    group: 'admin',
    type: 'timestamp',
    minWidth: 180,
    sourceKeys: ['attended_at'],
    get: (row) => formatSystemTimestamp(row?.attended_at),
  },
  {
    id: 'last_joined_at',
    label: 'Last joined at (UTC)',
    group: 'admin',
    type: 'timestamp',
    minWidth: 180,
    sourceKeys: ['last_joined_at'],
    get: (row) => formatSystemTimestamp(row?.last_joined_at),
  },
  {
    id: 'join_count',
    label: 'Join count',
    group: 'admin',
    type: 'number',
    minWidth: 100,
    sourceKeys: ['join_count'],
    get: (row) => {
      if (row?.join_count == null || row.join_count === '') return present(0, '0');
      return present(row.join_count, String(Number(row.join_count) || 0));
    },
  },
  {
    id: 'join_source',
    label: 'Join source',
    group: 'admin',
    type: 'text',
    minWidth: 120,
    sourceKeys: ['join_source'],
    get: (row) => textOrMissing(row?.join_source),
  },
  {
    id: 'event_id',
    label: 'Event ID',
    group: 'admin',
    type: 'text',
    minWidth: 140,
    sourceKeys: ['event_id'],
    get: (row) => textOrMissing(row?.event_id),
  },
  {
    id: 'event_title',
    label: 'Event',
    group: 'admin',
    type: 'text',
    minWidth: 180,
    sourceKeys: ['event_title'],
    get: (row) => textOrMissing(row?.event_title),
  },
  {
    id: 'account_phone',
    label: 'Account phone (profile)',
    group: 'admin',
    type: 'phone',
    minWidth: 160,
    sourceKeys: ['account_phone'],
    get: (row) => phoneOrMissing(row?.account_phone),
  },
  {
    id: 'current_marketing_opt_in',
    label: 'Current marketing preference',
    group: 'admin',
    type: 'checkbox',
    minWidth: 190,
    sourceKeys: ['current_marketing_opt_in'],
    get: (row) => formatYesNo(row?.current_marketing_opt_in),
  },
];

const KNOWN_SOURCE_KEYS = new Set(
  BASE_ATTENDEE_FIELDS.flatMap((field) => [field.id, ...(field.sourceKeys || [])]),
);

export function valueFromUnknownStored(value) {
  if (value == null || value === '') return missing();
  if (Array.isArray(value) || (typeof value === 'string' && value.trim().startsWith('['))) {
    return formatListAnswer(value);
  }
  if (typeof value === 'object') return uploadDisplay(value);
  if (value === 0 || value === '0') return present(0, '0');
  if (value === false) return explicitNo(value);
  if (value === true) return present(true, 'Yes');
  return textOrMissing(value);
}

export function resolveAttendeeFields(rows = []) {
  const extras = [];
  const seen = new Set(KNOWN_SOURCE_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (seen.has(key) || SKIP_EXTRA_KEYS.has(key) || isSecretFieldKey(key)) continue;
      seen.add(key);
      extras.push({
        id: `extra:${key}`,
        sourceKey: key,
        label: `${humanizeFieldKey(key)} (stored field)`,
        group: 'form',
        type: 'text',
        minWidth: 160,
        historical: true,
        labelUncertain: true,
        get: (item) => valueFromUnknownStored(item?.[key]),
      });
    }
  }
  return [...BASE_ATTENDEE_FIELDS, ...extras];
}

export function getFieldValue(row, field) {
  if (!field) return missing();
  try {
    const cell = field.get ? field.get(row) : valueFromUnknownStored(row?.[field.sourceKey || field.id]);
    if (!cell || !cell.kind) return missing();
    if (field.type === 'phone' && cell.kind === VALUE_KIND.VALUE) {
      return { ...cell, type: 'phone', display: trimPhoneText(cell.display) };
    }
    return cell;
  } catch {
    return missing();
  }
}

export function formatTableDisplay(cell) {
  if (!cell || cell.kind === VALUE_KIND.MISSING) return '—';
  if (cell.kind === VALUE_KIND.NA) return 'Not applicable';
  if (cell.kind === VALUE_KIND.NO) return 'No';
  if (cell.display === 0 || cell.display === '0') return '0';
  return cell.display == null ? '' : String(cell.display);
}

export function sanitizeSpreadsheetValue(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

export function formatExportDisplay(cell, { sanitize = true, format = 'csv', field } = {}) {
  let text = '';
  if (!cell || cell.kind === VALUE_KIND.MISSING) text = '';
  else if (cell.kind === VALUE_KIND.NA) text = 'Not applicable';
  else if (cell.kind === VALUE_KIND.NO) text = 'No';
  else text = cell.display == null ? '' : String(cell.display);

  if (!sanitize) return text;
  const isPhone = field?.type === 'phone' || cell?.type === 'phone';
  if (isPhone && format === 'xlsx') {
    if (/^[=@\t\r]/.test(text) || /^-/.test(text)) return `'${text}`;
    return text;
  }
  return sanitizeSpreadsheetValue(text);
}

export function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildCsvDocument(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return `\uFEFF${lines.join('\n')}`;
}

export function mapAttendeeExportMatrix(registrations, fields, { format = 'csv' } = {}) {
  const headers = fields.map((field) => field.label);
  const rows = registrations.map((row) => fields.map((field) => (
    formatExportDisplay(getFieldValue(row, field), { format, field })
  )));
  return { headers, rows };
}

export function attendeeSearchHaystack(row = {}) {
  return [
    row.user_name,
    row.user_email,
    row.booked_for_name,
    row.booked_for_email,
    row.booked_for_phone,
    row.guardian_phone,
    row.buyer_phone,
    row.account_phone,
    row.reference_code,
  ].map((value) => String(value || '').toLowerCase());
}

export function attendeeMatchesQuery(row, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return attendeeSearchHaystack(row).some((value) => value.includes(needle));
}

export function attendeeMatchesFilters(row, filters = {}) {
  const status = String(filters.status || '').trim().toLowerCase();
  if (status && String(row?.status || '').toLowerCase() !== status) return false;

  const paymentStatus = String(filters.payment_status || '').trim().toLowerCase();
  if (paymentStatus && String(row?.payment_status || '').toLowerCase() !== paymentStatus) return false;

  const attended = String(filters.attended || '').trim().toLowerCase();
  if (attended === 'yes' && !hasAttended(row)) return false;
  if (attended === 'no' && hasAttended(row)) return false;
  return true;
}

export function filterAttendeeRows(rows = [], {
  q = '',
  status = '',
  payment_status = '',
  attended = '',
  ids = null,
} = {}) {
  const idSet = Array.isArray(ids) && ids.length
    ? new Set(ids.map((id) => String(id)))
    : null;
  return rows.filter((row) => {
    if (idSet && !idSet.has(String(row?.id))) return false;
    if (!attendeeMatchesQuery(row, q)) return false;
    return attendeeMatchesFilters(row, { status, payment_status, attended });
  });
}

export function readColumnPrefs() {
  if (typeof localStorage === 'undefined') return { hidden: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMN_PREFS_KEY) || '{}');
    return { hidden: Array.isArray(raw.hidden) ? raw.hidden.map(String) : [] };
  } catch {
    return { hidden: [] };
  }
}

export function writeColumnPrefs(hidden = []) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ hidden: hidden.map(String) }));
}

export function visibleAttendeeFields(fields, hiddenIds = []) {
  const hidden = new Set((hiddenIds || []).map(String));
  return fields.filter((field) => !hidden.has(field.id));
}

export function truncateDisplay(text, max = 80) {
  const value = String(text ?? '');
  if (value.length <= max) return { text: value, truncated: false };
  return { text: `${value.slice(0, max).trimEnd()}…`, truncated: true };
}

export function exportFilename(event = {}, format = 'csv', exportedAt = new Date()) {
  const stamp = exportedAt.toISOString().slice(0, 10);
  const slug = String(event.slug || event.id || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'event';
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  return `attendees-${slug}-${stamp}.${ext}`;
}
