import { describe, expect, it, vi } from 'vitest';
import {
  resolveAttendeeName,
  resolveAttendeeEmail,
  isGuestTicket,
  isTicketPaymentEligible,
  isInPersonEventRecord,
  buildTicketViewModel,
  formatTicketDate,
} from './ticketViewModel.js';

vi.mock('./ticketQr.js', () => ({
  buildTicketQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  buildTicketScanUrl: vi.fn((ref, origin) => `${origin}/check-in/${ref}`),
}));

describe('resolveAttendeeName', () => {
  it('prefers booked_for_name over payer name', () => {
    expect(resolveAttendeeName({ booked_for_name: 'Guest A', user_name: 'Payer' })).toBe('Guest A');
  });

  it('falls back to payer name', () => {
    expect(resolveAttendeeName({ user_name: 'Self' })).toBe('Self');
  });
});

describe('isGuestTicket', () => {
  it('detects guest slot keys', () => {
    expect(isGuestTicket({ attendee_slot_key: 'guest-jane' })).toBe(true);
    expect(isGuestTicket({ attendee_slot_key: '__self__' })).toBe(false);
  });

  it('detects booked_for_name without slot', () => {
    expect(isGuestTicket({ booked_for_name: 'Jane Doe' })).toBe(true);
  });
});

describe('resolveAttendeeEmail', () => {
  it('uses guest email for guest tickets', () => {
    expect(resolveAttendeeEmail({
      attendee_slot_key: 'guest-a',
      booked_for_email: 'guest@example.com',
      user_email: 'buyer@example.com',
    })).toBe('guest@example.com');
  });

  it('uses buyer email for self tickets', () => {
    expect(resolveAttendeeEmail({
      attendee_slot_key: '__self__',
      user_email: 'buyer@example.com',
    })).toBe('buyer@example.com');
  });
});

describe('isTicketPaymentEligible', () => {
  it('allows paid, not_required, and waived', () => {
    expect(isTicketPaymentEligible({ payment_status: 'paid' })).toBe(true);
    expect(isTicketPaymentEligible({ payment_status: 'not_required' })).toBe(true);
    expect(isTicketPaymentEligible({ payment_status: 'waived' })).toBe(true);
  });

  it('rejects pending and cancelled', () => {
    expect(isTicketPaymentEligible({ payment_status: 'pending' })).toBe(false);
    expect(isTicketPaymentEligible({ payment_status: 'paid', status: 'cancelled' })).toBe(false);
  });
});

describe('isInPersonEventRecord', () => {
  it('respects explicit event_mode', () => {
    expect(isInPersonEventRecord({ event_mode: 'in_person' })).toBe(true);
    expect(isInPersonEventRecord({ event_mode: 'virtual' })).toBe(false);
  });
});

describe('formatTicketDate', () => {
  it('formats ISO dates', () => {
    expect(formatTicketDate('2026-07-15')).toMatch(/2026/);
  });

  it('returns dash for empty values', () => {
    expect(formatTicketDate('')).toBe('—');
  });
});

describe('buildTicketViewModel', () => {
  it('builds attendee, QR URL, and detail rows', async () => {
    const vm = await buildTicketViewModel({
      registration: {
        reference_code: 'MM-TKT-001',
        booked_for_name: 'Guest One',
        booked_for_email: 'guest@example.com',
        user_name: 'Buyer',
        user_email: 'buyer@example.com',
        payment_status: 'paid',
        status: 'confirmed',
        attendee_slot_key: 'guest-one',
      },
      event: {
        title: 'Summit 2026',
        start_date: '2026-07-15',
        start_time: '09:00',
        location: 'Lusaka',
        event_mode: 'in_person',
      },
      appOrigin: 'https://example.com',
      logoDataUrl: 'data:image/png;base64,logo',
    });

    expect(vm.refCode).toBe('MM-TKT-001');
    expect(vm.attendee.name).toBe('Guest One');
    expect(vm.isGuest).toBe(true);
    expect(vm.qrDataUrl).toContain('data:image/png');
    expect(vm.ticketUrl).toBe('https://example.com/check-in/MM-TKT-001');
    expect(vm.detailRows.some((row) => row.label === 'Event' && row.value.includes('Summit'))).toBe(true);
  });
});
