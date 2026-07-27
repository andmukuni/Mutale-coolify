import {
  isGuestTicket,
  isInPersonEventRecord,
  isTicketPaymentEligible,
  resolveAttendeeEmail,
  resolveAttendeeName,
  resolveAttendeePhone,
} from '../shared/ticketViewModel.js';

const VALID_PAYMENT = new Set(['paid', 'not_required', 'waived']);
const OTP_TTL_MS = 15 * 60 * 1000;
const GUEST_SESSION_TTL_SEC = 24 * 60 * 60;

/** @type {Map<string, { code: string, email: string, expiresAt: number }>} */
const otpByReference = new Map();

/** @type {Map<string, { token: string, registrationId: string, expiresAt: number }>} */
const verifiedSessionsByReference = new Map();

export function maskEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return '';
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  const visible = local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export function isGuestRegistration(reg = {}) {
  return isGuestTicket(reg);
}

export function resolveGuestDisplayName(reg = {}) {
  return resolveAttendeeName(reg);
}

export function eventRequiresGuestEmail(event = {}) {
  const mode = String(event.event_mode || '').trim().toLowerCase();
  if (mode === 'virtual') return true;
  const delivery = String(event.delivery_mode || '').trim().toLowerCase();
  if (delivery === 'virtual') return true;
  if (event.daily_room_name || event.daily_room_url) return true;
  if (event.zoom_meeting_id || event.zoom_join_url) return true;
  const loc = String(event.location || event.venue || '').toLowerCase();
  return loc.includes('virtual');
}

export function eventHasLiveJoin(event = {}) {
  if (eventRequiresGuestEmail(event)) return true;
  return Boolean(
    String(event.meeting_link || '').trim()
    || String(event.zoom_join_url || '').trim()
    || String(event.daily_room_url || '').trim(),
  );
}

export async function loadRegistrationByReference(pool, referenceCode) {
  const code = String(referenceCode || '').trim();
  if (!code) return { ok: false, status: 400, message: 'Ticket reference is required.' };

  const [[registration]] = await pool.query(
    'SELECT * FROM event_registrations WHERE reference_code = ? LIMIT 1',
    [code],
  );
  if (!registration) {
    return { ok: false, status: 404, message: 'Ticket not found.' };
  }

  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [registration.event_id]);
  if (!event) {
    return { ok: false, status: 404, message: 'Event not found for this ticket.' };
  }

  return { ok: true, registration, event };
}

export function assertTicketJoinEligible(registration, event, getJoinWindowForEvent) {
  const status = String(event?.status || '').toLowerCase();
  if (status === 'cancelled') {
    return { ok: false, status: 403, message: 'This event has been cancelled.' };
  }

  if (!isTicketPaymentEligible(registration)) {
    return { ok: false, status: 403, message: 'Registration payment is not approved for joining yet.' };
  }

  const regStatus = String(registration?.status || '').trim().toLowerCase();
  if (regStatus === 'cancelled') {
    return { ok: false, status: 403, message: 'This ticket has been cancelled.' };
  }

  const windowState = getJoinWindowForEvent(event);
  if (!windowState.allowed) {
    return {
      ok: false,
      status: 403,
      message: windowState.reason || 'Join is not available right now.',
      joinWindow: windowState,
    };
  }

  return { ok: true, joinWindow: windowState };
}

export function assertCanJoinByTicketReference({ registration, event, getJoinWindowForEvent, providerLabel = 'this meeting' }) {
  if (!registration || !event) {
    return { ok: false, status: 404, message: 'Ticket not found.' };
  }

  const eligibility = assertTicketJoinEligible(registration, event, getJoinWindowForEvent);
  if (!eligibility.ok) {
    return { ...eligibility, event, registration };
  }

  const userName = resolveGuestDisplayName(registration);
  const userEmail = resolveAttendeeEmail(registration) || String(registration.user_email || '').trim().toLowerCase();
  const userId = `guest:${String(registration.id || '').trim()}`;

  if (!userName) {
    return {
      ok: false,
      status: 403,
      message: `Ticket holder name is missing; cannot join ${providerLabel}.`,
      event,
      registration,
    };
  }

  return {
    ok: true,
    event,
    registration,
    windowState: eligibility.joinWindow,
    userId,
    userEmail,
    userName,
    role: 0,
  };
}

export async function buildGuestPortalPayload({
  pool,
  registration,
  event,
  appOrigin,
  getJoinWindowForEvent,
  isForumVisibleEvent,
  mapDbEventSession,
}) {
  const ref = String(registration.reference_code || '').trim();
  const guestUrl = appOrigin ? `${appOrigin.replace(/\/$/, '')}/tickets/${encodeURIComponent(ref)}` : '';
  const joinWindow = getJoinWindowForEvent(event);
  const eligible = isTicketPaymentEligible(registration);
  const forumEnabled = isForumVisibleEvent(event);
  const canJoin = eligible && joinWindow.allowed && eventHasLiveJoin(event);

  const [sessionRows] = await pool.query(
    'SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC, start_time ASC',
    [registration.event_id],
  );
  const sessions = (sessionRows || []).map(mapDbEventSession).filter(Boolean);

  let certificate = null;
  const [[certRow]] = await pool.query(
    'SELECT * FROM event_certificates WHERE registration_id = ? AND revoked = 0 LIMIT 1',
    [registration.id],
  );
  if (certRow) {
    certificate = {
      id: certRow.id,
      certificate_code: certRow.certificate_code,
      issued_at: certRow.issued_at,
      attendee_name: certRow.attendee_name,
    };
  }

  const attendedAt = registration.attended_at || null;
  const checkedIn = Boolean(attendedAt) || String(registration.status || '').toLowerCase() === 'attended';

  return {
    reference_code: ref,
    registration_id: String(registration.id || '').trim(),
    is_guest: isGuestRegistration(registration),
    attendee_name: resolveGuestDisplayName(registration),
    booked_for_email_masked: maskEmail(resolveAttendeeEmail(registration)),
    attendee_phone: resolveAttendeePhone(registration) || null,
    guest_portal_url: guestUrl,
    guest_access_url: guestUrl,
    valid: eligible,
    can_join: canJoin,
    can_access_forum: forumEnabled && eligible,
    join_window: joinWindow,
    checked_in: checkedIn,
    checked_in_at: attendedAt,
    status: String(registration.status || '').trim().toLowerCase(),
    payment_status: String(registration.payment_status || '').trim().toLowerCase(),
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: String(event.short_description || event.description || '').slice(0, 500),
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_time,
      end_time: event.end_time,
      timezone: event.timezone,
      location: event.location || event.venue,
      event_mode: event.event_mode,
      forum_enabled: forumEnabled,
    },
    sessions,
    certificate,
    attendance: {
      attended_at: attendedAt,
      join_count: Number(registration.join_count || 0),
      join_source: registration.join_source || null,
    },
  };
}

export function storeAccessCode(referenceCode, email, code) {
  const ref = String(referenceCode || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  otpByReference.set(ref, {
    code: String(code),
    email: normalizedEmail,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

export function verifyAccessCode(referenceCode, code, expectedEmail) {
  const ref = String(referenceCode || '').trim();
  const entry = otpByReference.get(ref);
  if (!entry || entry.expiresAt < Date.now()) {
    otpByReference.delete(ref);
    return false;
  }
  const normalizedEmail = String(expectedEmail || '').trim().toLowerCase();
  if (entry.email !== normalizedEmail) return false;
  if (String(code || '').trim() !== entry.code) return false;
  otpByReference.delete(ref);
  return true;
}

export function issueGuestSessionToken({
  registrationId,
  referenceCode,
  signJwtHmacSha256,
  authSecret,
}) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + GUEST_SESSION_TTL_SEC;
  const token = signJwtHmacSha256({
    sub: String(registrationId),
    type: 'guest_ticket',
    ref: String(referenceCode),
    iat: now,
    exp,
  }, authSecret);

  verifiedSessionsByReference.set(String(referenceCode), {
    token,
    registrationId: String(registrationId),
    expiresAt: Date.now() + GUEST_SESSION_TTL_SEC * 1000,
  });

  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

export function verifyGuestSessionToken(token, referenceCode, verifyJwtHmacSha256, authSecret) {
  const claims = verifyJwtHmacSha256(token, authSecret);
  if (!claims || claims.type !== 'guest_ticket') return null;
  if (String(claims.ref || '') !== String(referenceCode || '').trim()) return null;
  if (claims.exp && Number(claims.exp) * 1000 < Date.now()) return null;
  return claims;
}

export function emailMatchesRegistration(registration, emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email) return false;
  const guestEmail = String(registration.booked_for_email || '').trim().toLowerCase();
  if (guestEmail && guestEmail === email) return true;
  if (!isGuestRegistration(registration)) {
    const userEmail = String(registration.user_email || '').trim().toLowerCase();
    return userEmail === email;
  }
  return false;
}

export function validateVirtualGuestEmail(event, guests = []) {
  if (!eventRequiresGuestEmail(event)) return { ok: true };
  for (let i = 0; i < guests.length; i += 1) {
    const guest = guests[i] || {};
    const email = String(guest.booked_for_email || guest.email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        ok: false,
        message: 'Guest email is required for virtual events so they can receive their ticket link and certificate.',
        index: i,
      };
    }
  }
  return { ok: true };
}

export function guestForumUserId(registrationId) {
  return `guest:${String(registrationId || '').trim()}`;
}

export { isInPersonEventRecord, isTicketPaymentEligible };
