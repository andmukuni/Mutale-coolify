/**
 * Event service utilities (availability, status checks).
 * Pure functions — no React dependencies.
 */

import {
  getEventTimeBounds,
  getEventRegistrationGateReason,
  isEventEnded,
  isEventOngoing,
} from '../../shared/eventRegistration.js';

// Re-export shared helpers used elsewhere in the app.
export { getEventTimeBounds, isEventOngoing };

// ─── EventAvailabilityService ────────────────────────────────────────────────
function normalizeEventStatus(status) {
  const normalized = String(status || 'published').toLowerCase();
  if (normalized === 'upcoming' || normalized === 'ongoing' || normalized === 'past') {
    return 'published';
  }
  return normalized;
}

function normalizeVisibility(visibility) {
  return String(visibility || 'public').toLowerCase();
}

export function resolveEventMode(event) {
  const explicit = String(event?.event_mode || '').trim().toLowerCase();
  if (explicit) return explicit;
  return String(event?.location || '').toLowerCase().includes('virtual') ? 'virtual' : 'in_person';
}

/** Virtual and hybrid events support guest registration (payer buys for others). */
export function isOnlineEvent(event) {
  const mode = resolveEventMode(event);
  return mode === 'virtual' || mode === 'hybrid';
}

export function isInPersonEvent(event) {
  return resolveEventMode(event) === 'in_person';
}

/** All event modes allow multi-attendee (self + guest) registration. */
export function allowsMultiAttendeeRegistration(event) {
  return Boolean(event?.id);
}

const VALID_ATTENDEE_TYPES = new Set(['adult', 'child']);
const VALID_CHILD_RELATIONS = new Set(['parent', 'guardian', 'teacher', 'other']);
const VALID_ATTENDEE_SEX = new Set(['male', 'female']);
export const MAX_CHILD_AGE = 18;

export function normalizeAttendeeType(raw = 'adult') {
  const t = String(raw || 'adult').trim().toLowerCase();
  return VALID_ATTENDEE_TYPES.has(t) ? t : 'adult';
}

export function normalizeAttendeeRelation(raw = '') {
  const r = String(raw || '').trim().toLowerCase();
  return VALID_CHILD_RELATIONS.has(r) ? r : '';
}

export function normalizeAttendeeSex(raw = '') {
  const sex = String(raw || '').trim().toLowerCase();
  if (sex === 'm') return 'male';
  if (sex === 'f') return 'female';
  return VALID_ATTENDEE_SEX.has(sex) ? sex : '';
}

export function normalizeAttendeeAge(raw) {
  if (raw == null || raw === '') return null;
  const age = Math.floor(Number(raw));
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

export function deriveGuestAttendeeSlotKey(name, index) {
  const slug = String(name || '').trim().toLowerCase().slice(0, 140);
  return `${slug || 'guest'}::${Number(index)}`;
}

export function validateGuestAttendees(attendees = []) {
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return { ok: true, error: null };
  }

  const seenNames = new Set();
  for (let i = 0; i < attendees.length; i += 1) {
    const row = attendees[i] || {};
    const name = String(row.name || row.booked_for_name || '').trim();
    if (!name) {
      return { ok: false, error: `Attendee ${i + 1} needs a name.` };
    }
    const attendeeType = normalizeAttendeeType(row.attendee_type || row.attendeeType);
    const sex = normalizeAttendeeSex(row.sex || row.attendee_sex || row.gender);
    if (!sex) {
      return { ok: false, error: `Attendee ${i + 1} (${name}): select sex (male or female).` };
    }
    if (attendeeType === 'child') {
      const relation = normalizeAttendeeRelation(row.relation || row.booked_for_relation);
      if (!relation) {
        return { ok: false, error: `Attendee ${i + 1} (${name}): select your relationship (parent, guardian, etc.).` };
      }
      const age = normalizeAttendeeAge(row.age ?? row.attendee_age);
      if (age == null) {
        return { ok: false, error: `Attendee ${i + 1} (${name}): enter age.` };
      }
      if (age > MAX_CHILD_AGE) {
        return { ok: false, error: `Attendee ${i + 1} (${name}): child age cannot be greater than ${MAX_CHILD_AGE}.` };
      }
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      return { ok: false, error: 'Each attendee must have a unique name in this order.' };
    }
    seenNames.add(key);
  }

  return { ok: true, error: null };
}

export function computeRegistrationTicketCount({ includeSelf = false, guestCount = 0 } = {}) {
  const guests = Math.max(0, Math.floor(Number(guestCount) || 0));
  const self = includeSelf ? 1 : 0;
  return self + guests;
}

export function getMaxGuestTickets(event, registrationCount, { includeSelf = true, hardCap = 20 } = {}) {
  const cap = Math.max(1, Math.floor(Number(hardCap) || 20));
  if (!event?.capacity) return cap;
  const remaining = Math.max(0, Number(event.capacity) - Number(registrationCount || 0));
  const reservedForSelf = includeSelf ? 1 : 0;
  return Math.max(0, Math.min(cap, remaining - reservedForSelf));
}

/** Mirrors server deriveAttendeeSlotKey — lowercase name slice, empty → __self__. */
export function deriveAttendeeSlotKey(bookedForNameRaw = '') {
  const raw = String(bookedForNameRaw || '').trim();
  if (!raw) return '__self__';
  return raw.toLowerCase().slice(0, 160);
}

export function getRegistrationAttendeeSlotKey(reg = {}) {
  const key = String(reg.attendee_slot_key || '').trim();
  if (key) return key;
  if (reg.booked_for_name) return deriveAttendeeSlotKey(reg.booked_for_name);
  return '__self__';
}

export function checkEventAvailability(event, registrations, userId, registrationType, options = {}) {
  if (!event) return { canBook: false, reason: 'Event not found.' };

  const {
    skipDuplicateCheck = false,
    attendeeSlotKey = '__self__',
  } = options && typeof options === 'object' ? options : {};

  const gateReason = getEventRegistrationGateReason(event);
  if (gateReason) return { canBook: false, reason: gateReason };

  const status = normalizeEventStatus(event.status);
  if (status !== 'published') return { canBook: false, reason: 'This event is not available for registration.' };

  // Booking type check
  const allowedTypes = event.booking_type === 'both'
    ? ['booking', 'subscription']
    : [event.booking_type];
  if (registrationType && !allowedTypes.includes(registrationType)) {
    return { canBook: false, reason: `This event does not support "${registrationType}" registration.` };
  }

  // Duplicate check (scoped by attendee slot — default __self__ so guest tickets don’t block the payer’s own slot)
  if (!skipDuplicateCheck && userId && registrationType) {
    const dupKey = attendeeSlotKey || '__self__';
    const duplicate = registrations.find(
      r => r.user_id === userId
        && r.event_id === event.id
        && r.registration_type === registrationType
        && r.status !== 'cancelled'
        && getRegistrationAttendeeSlotKey(r) === dupKey
    );
    if (duplicate) {
      const message = dupKey !== '__self__'
        ? 'You already registered this attendee for this event.'
        : 'You are already registered for this event.';
      return { canBook: false, reason: message };
    }
  }

  // Capacity check
  if (event.capacity) {
    const confirmed = registrations.filter(
      r => r.event_id === event.id && r.status !== 'cancelled'
    ).length;
    if (confirmed >= event.capacity) return { canBook: false, reason: 'This event has reached full capacity.' };
  }

  return { canBook: true, reason: null };
}

export function isEventPubliclyVisible(event) {
  if (!event) return false;
  const status = normalizeEventStatus(event.status);
  const visibility = normalizeVisibility(event.visibility);

  if (status === 'draft') return false;
  if (status === 'cancelled') return false;
  if (visibility === 'private') return false;
  return true;
}

// ─── EventStatusService ──────────────────────────────────────────────────────
export function getEventDisplayStatus(event) {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'closed') return 'closed';
  if (event.status === 'draft') return 'draft';

  const now = new Date();
  const { start, end } = getEventTimeBounds(event);

  if (!start || !end) return 'upcoming';

  if (now > end) return 'past';
  if (now >= start && now <= end) return 'ongoing';
  return 'upcoming';
}

export function isEventPast(event) {
  return isEventEnded(event);
}

export function isEventUpcoming(event) {
  const { start } = getEventTimeBounds(event);
  if (!start) return false;
  return new Date() < start;
}

export function getAvailableSpots(event, registrationCount) {
  if (!event.capacity) return null;
  return Math.max(0, event.capacity - registrationCount);
}

export function formatPrice(event) {
  if (event.is_free) return 'Free';
  const amount = Number(event.price || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';

  const hasDecimals = !Number.isInteger(amount);
  return `ZMW ${amount.toLocaleString('en-ZM', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Newest created/updated first — for admin event lists. */
export function sortEventsByRecentlyCreated(events = []) {
  return [...events].sort((a, b) => {
    const aTs = new Date(a.created_at || a.updated_at || 0).getTime();
    const bTs = new Date(b.created_at || b.updated_at || 0).getTime();
    if (bTs !== aTs) return bTs - aTs;
    return String(b.id).localeCompare(String(a.id));
  });
}
