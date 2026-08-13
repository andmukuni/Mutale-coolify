import { describe, expect, it } from 'vitest';
import { generateTicketReference, isTicketReference } from './ticketReference.js';

describe('generateTicketReference', () => {
  it('uses MM-YYYYMMDD-XXXX for the issue day in Africa/Lusaka', () => {
    const now = new Date('2026-08-13T16:00:00.000Z');
    expect(generateTicketReference(now, { randomDigits: '4821' })).toBe('MM-20260813-4821');
  });

  it('rolls to the Lusaka calendar day after midnight', () => {
    const now = new Date('2026-08-13T22:30:00.000Z');
    expect(generateTicketReference(now, { randomDigits: '0007' })).toBe('MM-20260814-0007');
  });

  it('pads a short numeric suffix to four digits', () => {
    const now = new Date('2026-08-13T10:00:00.000Z');
    expect(generateTicketReference(now, { randomDigits: '42' })).toBe('MM-20260813-0042');
  });

  it('assigns four random digits when none are provided', () => {
    const ref = generateTicketReference(new Date('2026-08-13T10:00:00.000Z'));
    expect(ref).toMatch(/^MM-20260813-\d{4}$/);
  });
});

describe('isTicketReference', () => {
  it('accepts the short MM date format', () => {
    expect(isTicketReference('MM-20260813-4821')).toBe(true);
  });

  it('rejects older long codes', () => {
    expect(isTicketReference('REG-1755091234567-A1B2C3')).toBe(false);
    expect(isTicketReference('MM-XK4P2N7M')).toBe(false);
  });
});
