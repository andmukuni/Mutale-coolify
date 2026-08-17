import { describe, it, expect } from 'vitest';
import {
  getEventRegistrationGateReason,
  getEventTimeBounds,
  isEventEnded,
  isEventOngoing,
} from './eventRegistration.js';
import { checkEventAvailability } from '../src/utils/eventServices.js';

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY = yesterday.toISOString().split('T')[0];

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW = tomorrow.toISOString().split('T')[0];

function wallClockInZone(date, timeZone = 'Africa/Lusaka') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function makeEvent(overrides = {}) {
  return {
    id: 'evt-1',
    title: 'Test Event',
    status: 'published',
    visibility: 'public',
    booking_type: 'booking',
    start_date: TOMORROW,
    end_date: TOMORROW,
    timezone: 'Africa/Lusaka',
    capacity: null,
    registration_deadline: null,
    ...overrides,
  };
}

describe('getEventTimeBounds', () => {
  it('treats stored clock times as Africa/Lusaka, not the server timezone', () => {
    const { start, end } = getEventTimeBounds({
      start_date: '2026-08-17',
      end_date: '2026-08-17',
      start_time: '19:30',
      end_time: '21:00',
      timezone: 'Africa/Lusaka',
    });
    expect(start.toISOString()).toBe('2026-08-17T17:30:00.000Z');
    expect(end.toISOString()).toBe('2026-08-17T19:00:00.000Z');
  });
});

describe('getEventRegistrationGateReason', () => {
  it('allows registration during an ongoing event even after the pre-start deadline', () => {
    const now = new Date();
    const start = wallClockInZone(new Date(now.getTime() - 60 * 60 * 1000));
    const end = wallClockInZone(new Date(now.getTime() + 60 * 60 * 1000));
    const deadline = wallClockInZone(new Date(now.getTime() - 30 * 60 * 1000));

    const event = makeEvent({
      start_date: start.date,
      end_date: end.date,
      start_time: start.time,
      end_time: end.time,
      timezone: 'Africa/Lusaka',
      registration_deadline: deadline.date,
      registration_deadline_time: deadline.time,
    });

    expect(isEventOngoing(event, now)).toBe(true);
    expect(getEventRegistrationGateReason(event, now)).toBeNull();
    expect(checkEventAvailability(event, [], 'user-1', 'booking').canBook).toBe(true);
  });

  it('blocks registration after the event ends', () => {
    const event = makeEvent({
      start_date: YESTERDAY,
      end_date: YESTERDAY,
      start_time: '09:00',
      end_time: '10:00',
    });

    expect(isEventEnded(event)).toBe(true);
    expect(getEventRegistrationGateReason(event)).toMatch(/ended/i);
  });

  it('still blocks upcoming events once the registration deadline has passed', () => {
    const event = makeEvent({
      start_date: TOMORROW,
      end_date: TOMORROW,
      registration_deadline: YESTERDAY,
    });

    expect(getEventRegistrationGateReason(event)).toMatch(/deadline/i);
  });
});
