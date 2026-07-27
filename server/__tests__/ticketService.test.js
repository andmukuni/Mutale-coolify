import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildTicketEmailCopy,
  sendTicketEmailsForRegistration,
  isTicketEmailAlreadySent,
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
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ticket_email_sent_at'),
      expect.any(Array),
    );
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

describe('isTicketEmailAlreadySent', () => {
  it('returns true when timestamp is set', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ ticket_email_sent_at: '2026-05-01' }]]),
    };
    expect(await isTicketEmailAlreadySent('reg-1', pool)).toBe(true);
  });
});
