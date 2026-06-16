import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isReceiptEligible,
  formatReceiptDisplayNumber,
  generateRegistrationReceiptBuffer,
  maybeSendReceiptOnSettlement,
  maybeSendRegistrationReceiptOnSettlement,
  sendReceiptEmail,
  isReceiptEmailAlreadySent,
  buildReceiptFilename,
} from '../receiptService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

describe('isReceiptEligible', () => {
  it('matches paid, not_required, and waived only', () => {
    expect(isReceiptEligible('paid')).toBe(true);
    expect(isReceiptEligible('NOT_REQUIRED')).toBe(true);
    expect(isReceiptEligible('waived')).toBe(true);
    expect(isReceiptEligible('pending')).toBe(false);
    expect(isReceiptEligible('unpaid')).toBe(false);
  });
});

describe('formatReceiptDisplayNumber', () => {
  it('returns six digits', () => {
    const n = formatReceiptDisplayNumber({ reference_code: 'MM-EVT-1-TEST' });
    expect(n).toHaveLength(6);
    expect(/^\d+$/.test(n)).toBe(true);
  });
});

describe('buildReceiptFilename', () => {
  it('uses reference code in filename', () => {
    expect(buildReceiptFilename({ reference_code: 'MM-EVT-ABC' }))
      .toBe('Receipt-MM-EVT-ABC.pdf');
  });
});

describe('generateRegistrationReceiptBuffer', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await generateRegistrationReceiptBuffer({
      appRoot,
      registration: {
        reference_code: 'MM-EVT-TEST-001',
        event_title: 'Test Event',
        event_id: 'evt-test-1',
        event_slug: 'test-event',
        user_name: 'Test User',
        user_email: 'test@example.com',
        payment_status: 'paid',
        amount_zmw: 30,
        currency: 'ZMW',
        registered_at: '2026-05-27T10:00:00.000Z',
        registration_type: 'subscription',
        payment_method: 'mobile_money',
      },
      user: { name: 'Test User', email: 'test@example.com' },
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('embeds event QR when appOrigin is provided', async () => {
    const buf = await generateRegistrationReceiptBuffer({
      appRoot,
      appOrigin: 'https://mutale.dev',
      registration: {
        reference_code: 'MM-EVT-QR-001',
        event_title: 'QR Event',
        event_slug: 'qr-event',
        event_id: 'evt-qr',
        user_name: 'Test User',
        payment_status: 'paid',
        amount_zmw: 30,
        currency: 'ZMW',
        registered_at: '2026-05-27T10:00:00.000Z',
        registration_type: 'subscription',
        payment_method: 'mobile_money',
      },
      user: { name: 'Test User' },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(500);
  });
});

describe('maybeSendRegistrationReceiptOnSettlement', () => {
  const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'sent', recipient: 'a@b.com' });
  const buildBrandedEmailHtml = vi.fn(() => '<p>html</p>');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when previous status was already eligible', async () => {
    const result = await maybeSendRegistrationReceiptOnSettlement({
      previousRegistration: { payment_status: 'paid' },
      currentRegistration: { payment_status: 'paid', user_email: 'a@b.com' },
      settings: {},
      sendEmailNotification,
      buildBrandedEmailHtml,
      appRoot,
    });
    expect(result.status).toBe('skipped');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('sends when transitioning from pending to paid', async () => {
    const result = await maybeSendRegistrationReceiptOnSettlement({
      previousRegistration: { payment_status: 'pending' },
      currentRegistration: {
        payment_status: 'paid',
        user_email: 'user@example.com',
        user_name: 'User',
        reference_code: 'MM-EVT-PATCH-1',
        event_title: 'Workshop',
        amount_zmw: 30,
        currency: 'ZMW',
        registered_at: '2026-05-27T10:00:00.000Z',
        registration_type: 'subscription',
        payment_method: 'mobile_money',
      },
      event: { title: 'Workshop' },
      settings: { email: { fromEmail: 'noreply@test.com', fromName: 'Test' } },
      sendEmailNotification,
      buildBrandedEmailHtml,
      appRoot,
    });
    expect(result.status).toBe('sent');
    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
    const call = sendEmailNotification.mock.calls[0][0];
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toContain('Receipt-');
    expect(Buffer.isBuffer(call.attachments[0].content)).toBe(true);
  });
});

describe('maybeSendReceiptOnSettlement alias', () => {
  it('exports the same behavior as legacy name', async () => {
    const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'skipped', reason: 'No recipient email.' });
    const result = await maybeSendReceiptOnSettlement({
      previousRegistration: { payment_status: 'paid' },
      currentRegistration: { payment_status: 'paid' },
      settings: {},
      sendEmailNotification,
      buildBrandedEmailHtml: vi.fn(),
      appRoot,
    });
    expect(result.status).toBe('skipped');
  });
});

describe('sendReceiptEmail idempotency', () => {
  const sendEmailNotification = vi.fn().mockResolvedValue({ status: 'sent' });
  const buildBrandedEmailHtml = vi.fn(() => '<p>html</p>');

  it('skips when receipt_email_sent_at is already set on record', async () => {
    const pool = { query: vi.fn() };
    const result = await sendReceiptEmail({
      registration: {
        payment_status: 'paid',
        user_email: 'a@b.com',
        receipt_email_sent_at: '2026-01-01T00:00:00.000Z',
        id: 'ord-1',
        receipt_source: 'order',
        receipt_source_id: 'ord-1',
      },
      settings: {},
      sendEmailNotification,
      buildBrandedEmailHtml,
      appRoot,
      pool,
    });
    expect(result.status).toBe('skipped');
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('checks database when pool is provided', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ receipt_email_sent_at: new Date() }], []]),
    };
    const result = await sendReceiptEmail({
      registration: {
        payment_status: 'paid',
        user_email: 'a@b.com',
        id: 'reg-1',
        receipt_source: 'registration',
        receipt_source_id: 'reg-1',
      },
      settings: {},
      sendEmailNotification,
      buildBrandedEmailHtml,
      appRoot,
      pool,
    });
    expect(result.status).toBe('skipped');
    expect(isReceiptEmailAlreadySent).toBeDefined();
    expect(pool.query).toHaveBeenCalled();
  });
});
