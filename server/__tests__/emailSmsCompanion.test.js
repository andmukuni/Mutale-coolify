import { describe, expect, it } from 'vitest';
import {
  SMS_MAX_LENGTH,
  buildSmsMessage,
  collectEmailSmsRecipients,
  hasExplicitSmsTo,
  shouldCopyAdminOnEmail,
  uniqueSmsRecipients,
} from '../emailSmsCompanion.js';

describe('email SMS companion', () => {
  it('prefers an explicit SMS message and truncates long text', () => {
    expect(buildSmsMessage({
      subject: 'Ignored subject',
      text: 'Ignored body',
      smsMessage: 'Short SMS',
    })).toBe('Short SMS');

    const long = 'A'.repeat(SMS_MAX_LENGTH + 40);
    const truncated = buildSmsMessage({ smsMessage: long });
    expect(truncated).toHaveLength(SMS_MAX_LENGTH);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('builds a message from subject and email text when no SMS copy is given', () => {
    expect(buildSmsMessage({
      subject: 'Registration Confirmed',
      text: 'Thank you for registering.\n\n\nSee you soon.',
    })).toBe('Registration Confirmed\n\nThank you for registering.\n\nSee you soon.');
  });

  it('normalizes and dedupes Zambian phone numbers', () => {
    expect(uniqueSmsRecipients(['0971234567', '+260971234567', '260971234567', '', '0961111111']))
      .toEqual(['260971234567', '260961111111']);
  });

  it('does not copy the admin on secret email kinds', () => {
    expect(shouldCopyAdminOnEmail({ kind: 'auth' })).toBe(false);
    expect(shouldCopyAdminOnEmail({ kind: 'access_code' })).toBe(false);
    expect(shouldCopyAdminOnEmail({ kind: 'test' })).toBe(false);
    expect(shouldCopyAdminOnEmail({ kind: 'event_reminder' })).toBe(false);
    expect(shouldCopyAdminOnEmail({ kind: 'registration' })).toBe(true);
    expect(shouldCopyAdminOnEmail({ kind: 'receipt' })).toBe(true);
    expect(shouldCopyAdminOnEmail({})).toBe(true);
  });

  it('collects the recipient and admin unless the kind is secret', () => {
    const settings = { notifications: { adminAlertPhone: '0961111111' } };

    expect(collectEmailSmsRecipients({
      settings,
      smsTo: '0971234567',
      kind: 'ticket',
    })).toEqual(['260971234567', '260961111111']);

    expect(collectEmailSmsRecipients({
      settings,
      smsTo: '0971234567',
      kind: 'auth',
    })).toEqual(['260971234567']);

    expect(collectEmailSmsRecipients({
      settings,
      smsTo: '0961111111',
      kind: 'receipt',
    })).toEqual(['260961111111']);
  });

  it('detects whether a caller passed an explicit SMS recipient', () => {
    expect(hasExplicitSmsTo('0971234567')).toBe(true);
    expect(hasExplicitSmsTo(['', '0971234567'])).toBe(true);
    expect(hasExplicitSmsTo(['', '  '])).toBe(false);
    expect(hasExplicitSmsTo('')).toBe(false);
    expect(hasExplicitSmsTo(undefined)).toBe(false);
  });
});
