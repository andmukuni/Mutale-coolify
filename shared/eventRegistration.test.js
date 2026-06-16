import { describe, it, expect } from 'vitest';
import {
  getEventRegistrationGateReason,
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
    ...overrides,
  };
}

describe('getEventRegistrationGateReason', () => {
  it('allows registration during an ongoing event even after the pre-start deadline', () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const deadline = new Date(now.getTime() - 30 * 60 * 1000);

    const event = makeEvent({
      start_date: today,
      end_date: today,
      start_time: start.toTimeString().slice(0, 5),
      end_time: end.toTimeString().slice(0, 5),
      registration_deadline: today,
      registration_deadline_time: deadline.toTimeString().slice(0, 5),
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
