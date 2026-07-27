import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertCanJoinByTicketReference,
  emailMatchesRegistration,
  eventRequiresGuestEmail,
  isGuestRegistration,
  maskEmail,
  storeAccessCode,
  validateVirtualGuestEmail,
  verifyAccessCode,
} from '../guestTicketService.js';

describe('guestTicketService', () => {
  describe('maskEmail', () => {
    it('masks local part', () => {
      expect(maskEmail('guest@example.com')).toMatch(/gu\*.*@example\.com/);
    });

    it('returns empty for invalid email', () => {
      expect(maskEmail('not-an-email')).toBe('');
    });
  });

  describe('isGuestRegistration', () => {
    it('detects guest by slot key', () => {
      expect(isGuestRegistration({ attendee_slot_key: 'alice' })).toBe(true);
    });

    it('detects self registration', () => {
      expect(isGuestRegistration({ attendee_slot_key: '__self__' })).toBe(false);
    });
  });

  describe('eventRequiresGuestEmail', () => {
    it('requires email for virtual events', () => {
      expect(eventRequiresGuestEmail({ event_mode: 'virtual' })).toBe(true);
    });

    it('does not require for in-person', () => {
      expect(eventRequiresGuestEmail({ event_mode: 'in_person', location: 'Lusaka' })).toBe(false);
    });
  });

  describe('validateVirtualGuestEmail', () => {
    it('rejects missing guest email on virtual events', () => {
      const result = validateVirtualGuestEmail(
        { event_mode: 'virtual' },
        [{ booked_for_name: 'Guest' }],
      );
      expect(result.ok).toBe(false);
    });

    it('allows missing email for in-person', () => {
      const result = validateVirtualGuestEmail(
        { event_mode: 'in_person' },
        [{ booked_for_name: 'Guest' }],
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('assertCanJoinByTicketReference', () => {
    const getJoinWindowForEvent = vi.fn(() => ({
      allowed: true,
      reason: null,
      joinFrom: new Date().toISOString(),
      joinUntil: new Date(Date.now() + 3600000).toISOString(),
    }));

    it('allows eligible guest registration', () => {
      const result = assertCanJoinByTicketReference({
        registration: {
          id: 'reg-1',
          reference_code: 'REG-1',
          booked_for_name: 'Guest A',
          booked_for_email: 'guest@example.com',
          payment_status: 'paid',
          status: 'confirmed',
        },
        event: { id: 'evt-1', status: 'published', start_date: '2026-08-01' },
        getJoinWindowForEvent,
      });
      expect(result.ok).toBe(true);
      expect(result.userName).toBe('Guest A');
      expect(result.userId).toBe('guest:reg-1');
    });

    it('rejects cancelled tickets', () => {
      const result = assertCanJoinByTicketReference({
        registration: {
          id: 'reg-1',
          status: 'cancelled',
          payment_status: 'paid',
        },
        event: { id: 'evt-1', status: 'published' },
        getJoinWindowForEvent,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });

    it('rejects unpaid tickets', () => {
      const result = assertCanJoinByTicketReference({
        registration: {
          id: 'reg-1',
          status: 'confirmed',
          payment_status: 'pending',
          booked_for_name: 'Guest',
        },
        event: { id: 'evt-1', status: 'published' },
        getJoinWindowForEvent,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('access code OTP', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('verifies valid code and clears store', () => {
      storeAccessCode('REG-ABC', 'guest@example.com', '123456');
      expect(verifyAccessCode('REG-ABC', '123456', 'guest@example.com')).toBe(true);
      expect(verifyAccessCode('REG-ABC', '123456', 'guest@example.com')).toBe(false);
    });

    it('rejects wrong email', () => {
      storeAccessCode('REG-ABC', 'guest@example.com', '123456');
      expect(verifyAccessCode('REG-ABC', '123456', 'other@example.com')).toBe(false);
    });
  });

  describe('emailMatchesRegistration', () => {
    it('matches guest email', () => {
      expect(emailMatchesRegistration(
        { booked_for_email: 'guest@example.com', attendee_slot_key: 'guest' },
        'guest@example.com',
      )).toBe(true);
    });
  });
});
