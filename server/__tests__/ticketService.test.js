import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildTicketEmailCopy,
  buildTicketSmsMessage,
  formatFirstNameSentenceCase,
  sendTicketEmailsForRegistration,
  sendRegistrationConfirmationIfNeeded,
  isTicketEmailAlreadySent,
  willSendTicketNotifications,
  shouldSendRegistrationSms,
} from '../ticketService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

vi.mock('../../shared/ticketPdfServer.js', () => ({
  buildTicketFilename: vi.fn(() => 'Ticket-MM-TKT-1.pdf'),
  generateTicketPdfBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock ticket pdf content padding')),
}));

vi.mock('../../shared/receiptLogoAsset.js', () => ({
  loadReceiptLogoDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,logo'),
}));

vi.mock('../../shared/ticketQr.js', () => ({
  buildTicketQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,qr'),
  buildTicketScanUrl: vi.fn((ref, origin) => `${origin}/tickets/${ref}`),
}));

describe('buildTicketEmailCopy', () => {
  it('uses attendee greeting for guest role', () => {
    const copy = buildTicketEmailCopy({
      registration: { reference_code: 'MM-1', booked_for_name: 'Guest' },
      event: { title: 'Summit' },
      recipientName: 'Guest',
      role: 'attendee',
    });
    expect(copy.subject).toContain('Your entry ticket');
    expect(copy.introLines.join(' ')).toContain('Summit');
  });

  it('uses buyer copy subject for purchaser role', () => {
    const copy = buildTicketEmailCopy({
      registration: { reference_code: 'MM-1', booked_for_name: 'Guest A' },
      event: { title: 'Summit' },
      recipientName: 'Buyer',
      role: 'buyer_copy',
    });
    expect(copy.subject).toContain('Ticket copy');
    expect(copy.subject).toContain('Guest A');
  });
});

describe('buildTicketSmsMessage', () => {
  it('sentence-cases the purchaser first name', () => {
    expect(formatFirstNameSentenceCase('ANDREW MUKUNI')).toBe('Andrew');
    expect(formatFirstNameSentenceCase('mutale')).toBe('Mutale');
    expect(formatFirstNameSentenceCase('')).toBe('');
  });

  it('thanks the purchaser and points to the ticket link', () => {
    expect(buildTicketSmsMessage({
      registration: { user_name: 'ANDREW MUKUNI' },
      event: { title: 'Navigating the Hidden Sorrows of Leading' },
      ticketUrl: 'https://mutalemubanga.org/tickets/REG-1',
    })).toBe(
      'Thank you, Andrew. Navigating the Hidden Sorrows of Leading. Join with your guest token: https://mutalemubanga.org/tickets/REG-1',
    );
  });

  it('omits the name when the purchaser is unknown', () => {
    expect(buildTicketSmsMessage({
      event: { title: 'Summit' },
      ticketUrl: 'https://example.com/tickets/MM-1',
    })).toBe('Thank you. Summit. Join with your guest token: https://example.com/tickets/MM-1');
  });
});

describe('sendTicketEmailsForRegistration', () => {
  const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'sent', recipient: 'test@example.com' });
  const settings = { email: { fromEmail: 'noreply@test.com', fromName: 'Test' } };
  const inPersonEvent = { title: 'Summit', event_mode: 'in_person' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips virtual events without guest email', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: { payment_status: 'paid', user_email: 'a@b.com' },
      event: { event_mode: 'virtual' },
      settings,
      sendEmailNotification,
      appRoot,
    });
    expect(result.status).toBe('skipped');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('sends virtual guest ticket link when guest email is set', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: {
        payment_status: 'paid',
        booked_for_name: 'Guest',
        booked_for_email: 'guest@example.com',
        attendee_slot_key: 'guest',
        reference_code: 'REG-1',
      },
      event: { event_mode: 'virtual', title: 'Webinar' },
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://app.example.com',
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalled();
  });

  it('skips unpaid registrations', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: { payment_status: 'pending', user_email: 'a@b.com' },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
    });
    expect(result.status).toBe('skipped');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('sends guest and buyer emails', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ ticket_email_sent_at: null }]]),
    };
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-1',
        reference_code: 'MM-TKT-1',
        payment_status: 'paid',
        user_email: 'buyer@example.com',
        user_name: 'Buyer',
        booked_for_name: 'Guest',
        booked_for_email: 'guest@example.com',
        attendee_slot_key: 'guest-guest',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
      pool,
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledTimes(2);
    expect(sendEmailNotification.mock.calls[0][0].smsMessage).toBe(
      'Thank you, Buyer. Summit. Join with your guest token: https://example.com/tickets/MM-TKT-1/join',
    );
    expect(sendEmailNotification.mock.calls[1][0].skipSms).toBeFalsy();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ticket_email_sent_at'),
      expect.any(Array),
    );
  });

  it('sends only one ticket SMS when guest and buyer share a phone', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ ticket_email_sent_at: null }]]),
    };
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-same-phone',
        reference_code: 'MM-TKT-9',
        payment_status: 'paid',
        user_email: 'buyer@example.com',
        user_name: 'Buyer',
        user_phone: '0971234567',
        booked_for_name: 'Guest',
        booked_for_email: 'guest@example.com',
        booked_for_phone: '0971234567',
        attendee_slot_key: 'guest-guest',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
      pool,
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledTimes(2);
    expect(sendEmailNotification.mock.calls[0][0].skipSms).toBeFalsy();
    expect(sendEmailNotification.mock.calls[1][0].skipSms).toBe(true);
  });

  it('puts a signed guest join token on the meeting link', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-token',
        reference_code: 'MM-TKT-TOKEN',
        payment_status: 'paid',
        user_email: 'buyer@example.com',
        user_name: 'Buyer',
        attendee_slot_key: '__self__',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
      signJwtHmacSha256: (payload) => `signed.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`,
      authSecret: 'secret',
    });
    expect(result.status).toBe('sent');
    const sms = sendEmailNotification.mock.calls[0][0].smsMessage;
    const text = sendEmailNotification.mock.calls[0][0].text;
    expect(sms).toMatch(/\/tickets\/MM-TKT-TOKEN\/join\?token=/);
    expect(text).toMatch(/\/tickets\/MM-TKT-TOKEN\/join\?token=/);
  });

  it('dedupes when guest email equals buyer email', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ ticket_email_sent_at: null }]])
        .mockResolvedValueOnce([]),
    };
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-2',
        reference_code: 'MM-TKT-2',
        payment_status: 'not_required',
        user_email: 'same@example.com',
        user_name: 'Self',
        attendee_slot_key: '__self__',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
      pool,
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
  });

  it('posts companion SMS for complimentary (free) in-person registrations', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-free',
        reference_code: 'MM-FREE-1',
        payment_status: 'not_required',
        status: 'confirmed',
        user_email: 'free@example.com',
        user_name: 'Free Attendee',
        user_phone: '0971234567',
        attendee_slot_key: '__self__',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
    expect(sendEmailNotification.mock.calls[0][0].skipSms).toBeFalsy();
    expect(sendEmailNotification.mock.calls[0][0].smsTo).toBe('0971234567');
    expect(sendEmailNotification.mock.calls[0][0].smsMessage).toContain('Summit');
    expect(sendEmailNotification.mock.calls[0][0].kind).toBe('ticket');
  });

  it('uses the buyer phone fallback so free tickets still post SMS', async () => {
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-free-phone',
        reference_code: 'MM-FREE-2',
        payment_status: 'not_required',
        user_email: 'free@example.com',
        user_name: 'Free Attendee',
        attendee_slot_key: '__self__',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin: 'https://example.com',
      buyerPhone: '0961111111',
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification.mock.calls[0][0].smsTo).toBe('0961111111');
    expect(sendEmailNotification.mock.calls[0][0].skipSms).toBeFalsy();
  });

  it('skips when ticket emails already sent', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ ticket_email_sent_at: '2026-01-01' }]]),
    };
    const result = await sendTicketEmailsForRegistration({
      registration: {
        id: 'reg-3',
        payment_status: 'paid',
        user_email: 'buyer@example.com',
      },
      event: inPersonEvent,
      settings,
      sendEmailNotification,
      appRoot,
      pool,
    });
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('already sent');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });
});

describe('willSendTicketNotifications', () => {
  it('is true for a paid in-person ticket with a buyer email', () => {
    expect(willSendTicketNotifications({
      registration: { payment_status: 'paid', user_email: 'a@b.com' },
      event: { event_mode: 'in_person' },
    })).toBe(true);
  });

  it('is true for complimentary (free) in-person tickets', () => {
    expect(willSendTicketNotifications({
      registration: { payment_status: 'not_required', user_email: 'a@b.com' },
      event: { event_mode: 'in_person' },
    })).toBe(true);
  });

  it('is false for unpaid registrations', () => {
    expect(willSendTicketNotifications({
      registration: { payment_status: 'pending', user_email: 'a@b.com' },
      event: { event_mode: 'in_person' },
    })).toBe(false);
  });

  it('is false for virtual events without a guest email', () => {
    expect(willSendTicketNotifications({
      registration: { payment_status: 'paid', user_email: 'a@b.com' },
      event: { event_mode: 'virtual' },
    })).toBe(false);
  });

  it('is false for complimentary virtual self-registrations so registration SMS can send', () => {
    expect(willSendTicketNotifications({
      registration: { payment_status: 'not_required', user_email: 'a@b.com' },
      event: { event_mode: 'virtual' },
    })).toBe(false);
  });
});

describe('shouldSendRegistrationSms', () => {
  it('sends registration SMS for free virtual events when tickets will not', () => {
    expect(shouldSendRegistrationSms({
      registration: { payment_status: 'not_required', user_email: 'a@b.com' },
      event: { event_mode: 'virtual' },
    })).toBe(true);
  });

  it('skips registration SMS for free in-person events because ticket SMS will send', () => {
    expect(shouldSendRegistrationSms({
      registration: { payment_status: 'not_required', user_email: 'a@b.com' },
      event: { event_mode: 'in_person' },
    })).toBe(false);
  });

  it('does not send registration SMS for unpaid pending registrations', () => {
    expect(shouldSendRegistrationSms({
      registration: { payment_status: 'pending', user_email: 'a@b.com' },
      event: { event_mode: 'virtual' },
    })).toBe(false);
  });
});

describe('sendRegistrationConfirmationIfNeeded', () => {
  it('posts registration SMS for a complimentary virtual event', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'sent' });
    const result = await sendRegistrationConfirmationIfNeeded({
      registration: {
        payment_status: 'not_required',
        user_email: 'free@example.com',
        user_name: 'Grace Tembo',
        reference_code: 'MM-FREE-3',
      },
      event: { title: 'Community Workshop', slug: 'community-workshop', event_mode: 'virtual' },
      settings: { email: { fromEmail: 'noreply@test.com' } },
      sendEmailNotification,
      appOrigin: 'https://mutalemubanga.org',
      smsTo: '0971234567',
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledWith(expect.objectContaining({
      to: 'free@example.com',
      smsTo: '0971234567',
      skipSms: false,
      kind: 'registration',
      templateSlug: 'registration',
    }));
    expect(sendEmailNotification.mock.calls[0][0].smsMessage).toMatch(/Community Workshop/);
    expect(sendEmailNotification.mock.calls[0][0].smsMessage).toContain('/tickets/MM-FREE-3');
  });

  it('skips when ticket SMS will already go out', async () => {
    const sendEmailNotification = vi.fn();
    const result = await sendRegistrationConfirmationIfNeeded({
      registration: { payment_status: 'not_required', user_email: 'a@b.com' },
      event: { event_mode: 'in_person' },
      sendEmailNotification,
    });
    expect(result.status).toBe('skipped');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });
});

describe('isTicketEmailAlreadySent', () => {
  it('returns true when timestamp is set', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ ticket_email_sent_at: '2026-05-01' }]]),
    };
    expect(await isTicketEmailAlreadySent('reg-1', pool)).toBe(true);
  });
});
