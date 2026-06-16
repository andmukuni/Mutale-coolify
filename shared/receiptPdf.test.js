import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./receiptSnapshotHtml.js', () => ({
  captureViewModelToPdfBuffer: vi.fn().mockResolvedValue(
    Buffer.concat([Buffer.from('%PDF-mock-html'), Buffer.alloc(600)]),
  ),
}));

vi.mock('./receiptPdfLegacy.js', () => ({
  generateReceiptPdfBufferLegacy: vi.fn().mockResolvedValue(
    Buffer.concat([Buffer.from('%PDF-legacy'), Buffer.alloc(600)]),
  ),
}));

import { generateReceiptPdfBuffer, isValidPdfBuffer } from './receiptPdf.js';
import { captureViewModelToPdfBuffer } from './receiptSnapshotHtml.js';
import { generateReceiptPdfBufferLegacy } from './receiptPdfLegacy.js';
import { renderReceiptDocumentHtml } from './receiptDocumentHtml.js';

const baseRegistration = {
  reference_code: 'MM-EVT-SNAP-1',
  event_id: 'evt-1',
  event_slug: 'test-event',
  event_title: 'Test Event',
  user_name: 'Test User',
  user_email: 'test@example.com',
  payment_status: 'paid',
  amount_zmw: 30,
  currency: 'ZMW',
  registered_at: '2026-05-27T10:00:00.000Z',
  registration_type: 'subscription',
  payment_method: 'mobile_money',
};

const baseViewModel = {
  refCode: 'MM-EVT-SNAP-1',
  receiptNo: '123456',
  billedTo: { name: 'Test User', email: 'test@example.com', phone: '' },
  detailRows: [{ label: 'Event', value: 'Test Event' }],
  lineItemDesc: 'Event Registration – Test Event',
  currency: 'ZMW',
  lineAmountDisplay: '30.00',
  totalDisplay: '30',
  logoDataUrl: 'data:image/png;base64,logo',
  qrDataUrl: 'data:image/png;base64,qr',
};

const savedEnv = {};

function saveEnv(keys) {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv(keys) {
  for (const key of keys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

describe('isValidPdfBuffer', () => {
  it('accepts buffers starting with %PDF and above minimum size', () => {
    const buf = Buffer.alloc(600, 0);
    buf.write('%PDF-1.4', 0);
    expect(isValidPdfBuffer(buf)).toBe(true);
  });

  it('rejects too-small or non-PDF buffers', () => {
    expect(isValidPdfBuffer(Buffer.from('%PDF'))).toBe(false);
    expect(isValidPdfBuffer(Buffer.from('not-a-pdf'))).toBe(false);
    expect(isValidPdfBuffer(null)).toBe(false);
  });
});

describe('generateReceiptPdfBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveEnv(['RECEIPT_PDF_LEGACY', 'RECEIPT_PDF_HTML', 'NODE_ENV']);
    delete process.env.RECEIPT_PDF_LEGACY;
    delete process.env.RECEIPT_PDF_HTML;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    restoreEnv(['RECEIPT_PDF_LEGACY', 'RECEIPT_PDF_HTML', 'NODE_ENV']);
  });

  it('uses HTML preview pipeline by default in non-production', async () => {
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
      appOrigin: 'https://mutale.dev',
    });
    expect(captureViewModelToPdfBuffer).toHaveBeenCalled();
    expect(buf.slice(0, 14).toString()).toBe('%PDF-mock-html');
  });

  it('uses legacy when RECEIPT_PDF_LEGACY=1', async () => {
    process.env.RECEIPT_PDF_LEGACY = '1';
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
    });
    expect(generateReceiptPdfBufferLegacy).toHaveBeenCalled();
    expect(captureViewModelToPdfBuffer).not.toHaveBeenCalled();
    expect(buf.slice(0, 11).toString()).toBe('%PDF-legacy');
  });

  it('uses legacy by default when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
      appOrigin: 'https://mutalemubanga.org',
    });
    expect(generateReceiptPdfBufferLegacy).toHaveBeenCalled();
    expect(captureViewModelToPdfBuffer).not.toHaveBeenCalled();
    expect(buf.slice(0, 11).toString()).toBe('%PDF-legacy');
  });

  it('uses HTML on production when RECEIPT_PDF_HTML=1', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RECEIPT_PDF_HTML = '1';
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
      appOrigin: 'https://mutalemubanga.org',
    });
    expect(captureViewModelToPdfBuffer).toHaveBeenCalled();
    expect(buf.slice(0, 14).toString()).toBe('%PDF-mock-html');
  });

  it('falls back to legacy when HTML render throws', async () => {
    captureViewModelToPdfBuffer.mockRejectedValueOnce(new Error('html render failed'));
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
      appOrigin: 'https://mutale.dev',
    });
    expect(generateReceiptPdfBufferLegacy).toHaveBeenCalled();
    expect(buf.slice(0, 11).toString()).toBe('%PDF-legacy');
  });

  it('falls back to legacy when HTML render returns invalid buffer', async () => {
    captureViewModelToPdfBuffer.mockResolvedValueOnce(Buffer.from('not-a-pdf'));
    const buf = await generateReceiptPdfBuffer({
      registration: baseRegistration,
      logoDataUrl: 'data:image/png;base64,logo',
      appOrigin: 'https://mutale.dev',
    });
    expect(generateReceiptPdfBufferLegacy).toHaveBeenCalled();
    expect(buf.slice(0, 11).toString()).toBe('%PDF-legacy');
  });
});

describe('receipt preview parity markup', () => {
  it('includes preview labels and icons used in Receipt Preview', () => {
    const html = renderReceiptDocumentHtml(baseViewModel, { outerPadding: false });
    expect(html).toContain('Reference');
    expect(html).toContain('Billed To');
    expect(html).toContain('Thank You!');
    expect(html).toContain('M4 6l8 6 8-6M4 6v12h16V6');
    expect(html).toContain('data-receipt-root');
  });
});
