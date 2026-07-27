import { buildTicketQrDataUrl, buildTicketScanUrl } from './ticketQr.js';

function titleCase(str = '') {
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTicketDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).split('T')[0]);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-ZM', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTicketTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  return raw;
}

export function isGuestTicket(registration = {}) {
  const slot = String(registration.attendee_slot_key || '').trim();
  if (slot && slot !== '__self__') return true;
  return Boolean(String(registration.booked_for_name || '').trim());
}

export function resolveAttendeeName(registration = {}) {
  return String(registration.booked_for_name || '').trim()
    || String(registration.user_name || '').trim()
    || 'Guest';
}

export function resolveAttendeeEmail(registration = {}) {
  if (isGuestTicket(registration)) {
    return String(registration.booked_for_email || '').trim().toLowerCase();
  }
  return String(registration.user_email || '').trim().toLowerCase();
}

/** Contact phone for the ticket holder (guest fields when registering for others). */
export function resolveAttendeePhone(registration = {}) {
  if (isGuestTicket(registration)) {
    const direct = String(registration.booked_for_phone || '').trim();
    if (direct) return direct;
    if (String(registration.attendee_type || '').trim().toLowerCase() === 'child') {
      return String(registration.guardian_phone || '').trim();
    }
    return '';
  }
  return String(registration.booked_for_phone || registration.user_phone || '').trim();
}

export function resolvePayerName(registration = {}) {
  return String(registration.user_name || '').trim() || '—';
}

export function resolveEventTitle(event = {}, registration = {}) {
  return String(event.title || registration.event_title || '').trim() || 'Event';
}

export function resolveEventLocation(event = {}, registration = {}) {
  return String(event.location || event.venue || registration.event_location || '').trim() || '—';
}

export function isTicketPaymentEligible(registration = {}) {
  const status = String(registration.status || '').trim().toLowerCase();
  if (status === 'cancelled') return false;
  const pay = String(registration.payment_status || '').trim().toLowerCase();
  return ['paid', 'not_required', 'waived'].includes(pay);
}

export function isInPersonEventRecord(event = {}, registration = {}) {
  const explicit = String(event.event_mode || registration.event_mode || '').trim().toLowerCase();
  if (explicit) return explicit === 'in_person';
  const loc = String(event.location || event.venue || registration.event_location || '').toLowerCase();
  return !loc.includes('virtual');
}

export function buildTicketDetailRows(registration = {}, event = {}) {
  const eventTitle = resolveEventTitle(event, registration);
  const eventDate = formatTicketDate(event.start_date || event.date || registration.event_date);
  const eventTime = formatTicketTime(event.start_time || event.time);
  const location = resolveEventLocation(event, registration);
  const payer = resolvePayerName(registration);
  const attendee = resolveAttendeeName(registration);

  const rows = [
    { label: 'Event', value: eventTitle },
    { label: 'Date', value: eventDate },
  ];
  if (eventTime) rows.push({ label: 'Time', value: eventTime });
  rows.push({ label: 'Venue', value: location });
  rows.push({ label: 'Ticket holder', value: attendee });
  if (isGuestTicket(registration) && payer && payer !== attendee) {
    rows.push({ label: 'Purchased by', value: payer });
  }
  rows.push({ label: 'Status', value: titleCase(registration.status || 'confirmed') });
  return rows;
}

/**
 * @param {{ registration: object, event?: object, appOrigin?: string, logoDataUrl?: string, qrDataUrl?: string }} opts
 */
export async function buildTicketViewModel({
  registration = {},
  event = {},
  appOrigin = '',
  logoDataUrl = '',
  qrDataUrl: qrDataUrlIn = '',
} = {}) {
  const refCode = String(registration.reference_code || '—').trim();
  const attendee = {
    name: resolveAttendeeName(registration),
    email: resolveAttendeeEmail(registration) || String(registration.user_email || '').trim(),
    phone: resolveAttendeePhone(registration),
  };
  const payerName = resolvePayerName(registration);
  const ticketUrl = buildTicketScanUrl(refCode, appOrigin) || '';

  let qrDataUrl = qrDataUrlIn;
  if (!qrDataUrl && appOrigin && refCode && refCode !== '—') {
    qrDataUrl = await buildTicketQrDataUrl(refCode, appOrigin, { size: 200 });
  }

  return {
    refCode,
    ticketNo: refCode,
    attendee,
    payerName,
    detailRows: buildTicketDetailRows(registration, event),
    logoDataUrl,
    qrDataUrl,
    ticketUrl,
    eventTitle: resolveEventTitle(event, registration),
    isGuest: isGuestTicket(registration),
  };
}
