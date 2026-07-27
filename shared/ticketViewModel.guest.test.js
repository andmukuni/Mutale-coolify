import { describe, it, expect } from 'vitest';
import {
  isGuestTicket,
  resolveAttendeeEmail,
  resolveAttendeeName,
  resolveAttendeePhone,
} from './ticketViewModel.js';

describe('guest attendee contact resolution', () => {
  const guestReg = {
    attendee_slot_key: 'jane-doe',
    booked_for_name: 'Jane Doe',
    booked_for_email: 'jane@example.com',
    booked_for_phone: '+260971234567',
    user_name: 'Purchaser Name',
    user_email: 'buyer@example.com',
  };

  it('identifies guest registrations', () => {
    expect(isGuestTicket(guestReg)).toBe(true);
    expect(isGuestTicket({ attendee_slot_key: '__self__' })).toBe(false);
  });

  it('uses guest name for certificates and tickets', () => {
    expect(resolveAttendeeName(guestReg)).toBe('Jane Doe');
  });

  it('sends certificate to guest email, not purchaser', () => {
    expect(resolveAttendeeEmail(guestReg)).toBe('jane@example.com');
    expect(resolveAttendeeEmail(guestReg)).not.toBe('buyer@example.com');
  });

  it('returns empty guest email when not provided (no purchaser fallback)', () => {
    expect(resolveAttendeeEmail({ ...guestReg, booked_for_email: null })).toBe('');
  });

  it('uses guest phone for identification', () => {
    expect(resolveAttendeePhone(guestReg)).toBe('+260971234567');
  });

  it('uses guardian phone for child guests', () => {
    expect(resolveAttendeePhone({
      attendee_slot_key: 'child',
      booked_for_name: 'Child Name',
      attendee_type: 'child',
      guardian_phone: '+260979999999',
    })).toBe('+260979999999');
  });

  it('uses member email for self registrations', () => {
    expect(resolveAttendeeEmail({
      attendee_slot_key: '__self__',
      user_email: 'member@example.com',
    })).toBe('member@example.com');
  });
});
