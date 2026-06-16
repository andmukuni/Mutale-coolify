import { describe, it, expect } from 'vitest';
import {
  getEventTimeBounds,
  isEventEnded,
  isRegistrationEligibleForCertificate,
} from '../utils/certificateEligibility';

describe('getEventTimeBounds', () => {
  it('uses end_date and end_time for the end bound', () => {
    const { start, end } = getEventTimeBounds({
      start_date: '2026-01-10',
      end_date: '2026-01-12',
      start_time: '09:00',
      end_time: '17:30',
    });
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('falls back to date field and end of day', () => {
    const { end } = getEventTimeBounds({ date: '2026-03-01' });
    expect(end).toBeInstanceOf(Date);
    expect(end.getHours()).toBe(23);
  });
});

describe('isEventEnded', () => {
  it('returns true when now is after event end', () => {
    const event = {
      start_date: '2020-01-01',
      end_date: '2020-01-01',
      end_time: '12:00',
    };
    expect(isEventEnded(event, new Date('2025-01-01'))).toBe(true);
  });

  it('returns false when now is before event end', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    const endStr = future.toISOString().split('T')[0];
    const event = {
      start_date: endStr,
      end_date: endStr,
      end_time: '23:59',
    };
    expect(isEventEnded(event, new Date())).toBe(false);
  });
});

describe('isRegistrationEligibleForCertificate', () => {
  it('accepts attended status', () => {
    expect(isRegistrationEligibleForCertificate({ status: 'attended' })).toBe(true);
  });

  it('accepts attended_at without attended status', () => {
    expect(
      isRegistrationEligibleForCertificate({ status: 'registered', attended_at: '2026-01-02' }),
    ).toBe(true);
  });

  it('rejects cancelled registrations', () => {
    expect(
      isRegistrationEligibleForCertificate({ status: 'cancelled', attended_at: '2026-01-02' }),
    ).toBe(false);
  });

  it('rejects registered without attendance', () => {
    expect(isRegistrationEligibleForCertificate({ status: 'registered' })).toBe(false);
  });
});
