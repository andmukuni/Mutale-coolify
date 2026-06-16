import { describe, it, expect } from 'vitest';
import {
  checkEventAvailability,
  deriveAttendeeSlotKey,
  getRegistrationAttendeeSlotKey,
  getEventDisplayStatus,
  isEventPast,
  isEventUpcoming,
  isEventPubliclyVisible,
  getAvailableSpots,
  formatPrice,
  sortEventsByRecentlyCreated,
} from '../utils/eventServices';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW = tomorrow.toISOString().split('T')[0];

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY = yesterday.toISOString().split('T')[0];

const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);
const NEXT_WEEK = nextWeek.toISOString().split('T')[0];

function makeEvent(overrides = {}) {
  return {
    id: 'evt-1',
    title: 'Test Event',
    status: 'published',
    visibility: 'public',
    booking_type: 'booking',
    start_date: TOMORROW,
    end_date: TOMORROW,
    capacity: null,
    registration_deadline: null,
    is_free: true,
    price: 0,
    ...overrides,
  };
}

function makeRegistration(overrides = {}) {
  return {
    id: 'reg-1',
    user_id: 'user-1',
    event_id: 'evt-1',
    registration_type: 'booking',
    status: 'confirmed',
    ...overrides,
  };
}

// ─── checkEventAvailability ───────────────────────────────────────────────────

describe('checkEventAvailability', () => {
  it('allows booking on a valid published upcoming event', () => {
    const result = checkEventAvailability(makeEvent(), [], 'user-1', 'booking');
    expect(result.canBook).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('allows booking when legacy status is "upcoming"', () => {
    const result = checkEventAvailability(makeEvent({ status: 'upcoming' }), [], 'user-1', 'booking');
    expect(result.canBook).toBe(true);
  });

  it('blocks booking when event is null', () => {
    const result = checkEventAvailability(null, [], 'user-1', 'booking');
    expect(result.canBook).toBe(false);
  });

  it('blocks booking when event is cancelled', () => {
    const result = checkEventAvailability(makeEvent({ status: 'cancelled' }), [], 'user-1', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/cancelled/i);
  });

  it('blocks booking when event is closed', () => {
    const result = checkEventAvailability(makeEvent({ status: 'closed' }), [], 'user-1', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/closed/i);
  });

  it('blocks booking when event is a draft', () => {
    const result = checkEventAvailability(makeEvent({ status: 'draft' }), [], 'user-1', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/not available/i);
  });

  it('blocks booking for a private event', () => {
    const result = checkEventAvailability(makeEvent({ visibility: 'private' }), [], 'user-1', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/private/i);
  });

  it('blocks booking when registration deadline has passed', () => {
    const result = checkEventAvailability(
      makeEvent({ registration_deadline: YESTERDAY }),
      [],
      'user-1',
      'booking'
    );
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/deadline/i);
  });

  it('allows booking when registration deadline is in the future', () => {
    const result = checkEventAvailability(
      makeEvent({ registration_deadline: NEXT_WEEK }),
      [],
      'user-1',
      'booking'
    );
    expect(result.canBook).toBe(true);
  });

  it('blocks booking when registration deadline date+time has passed', () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const oneMinuteAgo = new Date(now.getTime() - 60_000).toTimeString().slice(0, 5);

    const result = checkEventAvailability(
      makeEvent({
        registration_deadline: today,
        registration_deadline_time: oneMinuteAgo,
      }),
      [],
      'user-1',
      'booking'
    );

    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/deadline/i);
  });

  it('blocks booking with wrong registration type', () => {
    const result = checkEventAvailability(
      makeEvent({ booking_type: 'booking' }),
      [],
      'user-1',
      'subscription'
    );
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/does not support/i);
  });

  it('allows both types when booking_type is "both"', () => {
    const event = makeEvent({ booking_type: 'both' });
    expect(checkEventAvailability(event, [], 'user-1', 'booking').canBook).toBe(true);
    expect(checkEventAvailability(event, [], 'user-1', 'subscription').canBook).toBe(true);
  });

  it('blocks duplicate registration for same user/event/type', () => {
    const regs = [makeRegistration()];
    const result = checkEventAvailability(makeEvent(), regs, 'user-1', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/already registered/i);
  });

  it('allows re-registration if previous was cancelled', () => {
    const regs = [makeRegistration({ status: 'cancelled' })];
    const result = checkEventAvailability(makeEvent(), regs, 'user-1', 'booking');
    expect(result.canBook).toBe(true);
  });

  it('allows second registration with different type on a "both" event', () => {
    const regs = [makeRegistration({ registration_type: 'booking' })];
    const event = makeEvent({ booking_type: 'both' });
    const result = checkEventAvailability(event, regs, 'user-1', 'subscription');
    expect(result.canBook).toBe(true);
  });

  it('blocks when event is at full capacity', () => {
    const regs = [
      makeRegistration({ id: 'reg-1' }),
      makeRegistration({ id: 'reg-2', user_id: 'user-2' }),
    ];
    const result = checkEventAvailability(makeEvent({ capacity: 2 }), regs, 'user-3', 'booking');
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/capacity/i);
  });

  it('allows booking when event has capacity and still has spots', () => {
    const regs = [makeRegistration()];
    const result = checkEventAvailability(makeEvent({ capacity: 5 }), regs, 'user-2', 'booking');
    expect(result.canBook).toBe(true);
  });

  it('ignores cancelled registrations when counting capacity', () => {
    const regs = [
      makeRegistration({ id: 'reg-1', status: 'cancelled' }),
      makeRegistration({ id: 'reg-2', status: 'cancelled' }),
    ];
    const result = checkEventAvailability(makeEvent({ capacity: 2 }), regs, 'user-3', 'booking');
    expect(result.canBook).toBe(true);
  });

  it('blocks registration after the event has ended even without a deadline', () => {
    const result = checkEventAvailability(
      makeEvent({ start_date: YESTERDAY, end_date: YESTERDAY, start_time: '09:00', end_time: '10:00' }),
      [],
      'user-1',
      'booking',
    );
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/ended/i);
  });

  it('allows booking for self when user only has a guest registration on file', () => {
    const regs = [
      makeRegistration({
        id: 'reg-g',
        registration_type: 'subscription',
        attendee_slot_key: 'tina',
        booked_for_name: 'Tina',
      }),
    ];
    const event = makeEvent({ booking_type: 'subscription' });
    const result = checkEventAvailability(event, regs, 'user-1', 'subscription', { attendeeSlotKey: '__self__' });
    expect(result.canBook).toBe(true);
  });

  it('blocks duplicate guest slot by normalized name', () => {
    const regs = [
      makeRegistration({
        id: 'reg-g',
        registration_type: 'subscription',
        attendee_slot_key: 'tina',
        booked_for_name: 'Tina',
      }),
    ];
    const event = makeEvent({ booking_type: 'subscription' });
    const result = checkEventAvailability(event, regs, 'user-1', 'subscription', { attendeeSlotKey: 'tina' });
    expect(result.canBook).toBe(false);
    expect(result.reason).toMatch(/already registered this attendee/i);
  });

  it('skipDuplicateCheck bypasses duplicate detection', () => {
    const regs = [makeRegistration()];
    const result = checkEventAvailability(makeEvent(), regs, 'user-1', 'booking', { skipDuplicateCheck: true });
    expect(result.canBook).toBe(true);
  });
});

describe('deriveAttendeeSlotKey / getRegistrationAttendeeSlotKey', () => {
  it('maps empty name to __self__', () => {
    expect(deriveAttendeeSlotKey('')).toBe('__self__');
    expect(deriveAttendeeSlotKey('  ')).toBe('__self__');
  });

  it('normalizes guest name for slot key', () => {
    expect(deriveAttendeeSlotKey('Jane M.')).toBe('jane m.');
  });

  it('infers slot from registration row', () => {
    expect(getRegistrationAttendeeSlotKey({ attendee_slot_key: 'x' })).toBe('x');
    expect(getRegistrationAttendeeSlotKey({ booked_for_name: 'Bo' })).toBe('bo');
    expect(getRegistrationAttendeeSlotKey({})).toBe('__self__');
  });
});

// ─── getEventDisplayStatus ────────────────────────────────────────────────────

describe('getEventDisplayStatus', () => {
  it('returns "cancelled" for cancelled events', () => {
    expect(getEventDisplayStatus(makeEvent({ status: 'cancelled' }))).toBe('cancelled');
  });

  it('returns "closed" for closed events', () => {
    expect(getEventDisplayStatus(makeEvent({ status: 'closed' }))).toBe('closed');
  });

  it('returns "draft" for draft events', () => {
    expect(getEventDisplayStatus(makeEvent({ status: 'draft' }))).toBe('draft');
  });

  it('returns "past" for events that ended yesterday', () => {
    const event = makeEvent({ start_date: YESTERDAY, end_date: YESTERDAY });
    expect(getEventDisplayStatus(event)).toBe('past');
  });

  it('returns "upcoming" for events starting tomorrow', () => {
    const event = makeEvent({ start_date: TOMORROW, end_date: TOMORROW });
    expect(getEventDisplayStatus(event)).toBe('upcoming');
  });

  it('returns "ongoing" for events that started today', () => {
    const today = new Date().toISOString().split('T')[0];
    const event = makeEvent({ start_date: today, end_date: NEXT_WEEK });
    expect(getEventDisplayStatus(event)).toBe('ongoing');
  });

  it('returns "upcoming" for events later today before start time', () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const event = makeEvent({
      start_date: today,
      end_date: today,
      start_time: oneHourLater.toTimeString().slice(0, 5),
      end_time: twoHoursLater.toTimeString().slice(0, 5),
    });

    expect(getEventDisplayStatus(event)).toBe('upcoming');
  });
});

// ─── isEventPast / isEventUpcoming ───────────────────────────────────────────

describe('isEventPast', () => {
  it('returns true for past events', () => {
    expect(isEventPast(makeEvent({ end_date: YESTERDAY }))).toBe(true);
  });

  it('returns false for future events', () => {
    expect(isEventPast(makeEvent({ end_date: TOMORROW }))).toBe(false);
  });

  it('falls back to date field when end_date is absent', () => {
    expect(isEventPast({ date: YESTERDAY })).toBe(true);
    expect(isEventPast({ date: TOMORROW })).toBe(false);
  });
});

describe('isEventUpcoming', () => {
  it('returns true for events starting tomorrow', () => {
    expect(isEventUpcoming(makeEvent({ start_date: TOMORROW }))).toBe(true);
  });

  it('returns false for events that already started', () => {
    expect(isEventUpcoming(makeEvent({ start_date: YESTERDAY }))).toBe(false);
  });
});

// ─── getAvailableSpots ────────────────────────────────────────────────────────

describe('getAvailableSpots', () => {
  it('returns null when no capacity is set', () => {
    expect(getAvailableSpots(makeEvent({ capacity: null }), 10)).toBeNull();
  });

  it('returns correct available spots', () => {
    expect(getAvailableSpots(makeEvent({ capacity: 50 }), 30)).toBe(20);
  });

  it('returns 0 and never goes negative when event is over capacity', () => {
    expect(getAvailableSpots(makeEvent({ capacity: 5 }), 10)).toBe(0);
  });
});

// ─── formatPrice ─────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('returns "Free" for free events', () => {
    expect(formatPrice(makeEvent({ is_free: true, price: 0 }))).toBe('Free');
  });

  it('returns "Free" when price is falsy and is_free is false', () => {
    expect(formatPrice(makeEvent({ is_free: false, price: 0 }))).toBe('Free');
  });

  it('formats a numeric price in ZMW', () => {
    expect(formatPrice(makeEvent({ is_free: false, price: 49 }))).toBe('ZMW 49');
  });
});

describe('isEventPubliclyVisible', () => {
  it('returns true for published public events', () => {
    expect(isEventPubliclyVisible(makeEvent({ status: 'published', visibility: 'public' }))).toBe(true);
  });

  it('returns true for legacy "upcoming" public events', () => {
    expect(isEventPubliclyVisible(makeEvent({ status: 'upcoming', visibility: 'public' }))).toBe(true);
  });

  it('returns true when status is missing and event is public', () => {
    expect(isEventPubliclyVisible(makeEvent({ status: undefined, visibility: 'public' }))).toBe(true);
  });

  it('returns false for draft events', () => {
    expect(isEventPubliclyVisible(makeEvent({ status: 'draft', visibility: 'public' }))).toBe(false);
  });

  it('returns false for private events', () => {
    expect(isEventPubliclyVisible(makeEvent({ status: 'published', visibility: 'private' }))).toBe(false);
  });

  it('returns false for missing event', () => {
    expect(isEventPubliclyVisible(null)).toBe(false);
  });
});

describe('sortEventsByRecentlyCreated', () => {
  it('orders by created_at descending', () => {
    const sorted = sortEventsByRecentlyCreated([
      { id: 'a', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', created_at: '2026-06-01T00:00:00Z' },
      { id: 'c', created_at: '2026-03-01T00:00:00Z' },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});
