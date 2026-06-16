import { describe, it, expect } from 'vitest';
import { buildReceiptPdfDocLegacy } from './receiptPdfLegacy.js';
import { generateReceiptPdfBuffer, isValidPdfBuffer } from './receiptPdf.js';

const demoRegistration = {
  reference_code: 'MM-DEMO-CERT-001',
  event_id: 'evt-demo-certificate-preview',
  event_slug: 'demo-qa-workshop-certificate-preview',
  event_title: 'ISO 15189 Laboratory Quality Systems Workshop',
  user_name: 'Mutale Mubanga',
  user_email: 'admin@mutale.dev',
  payment_status: 'not_required',
  amount_zmw: 0,
  currency: 'ZMW',
  registered_at: '2026-06-01T10:00:00.000Z',
  registration_type: 'subscription',
  payment_method: '',
};

describe('receipt PDF integration (real jsPDF)', () => {
  it('legacy builder produces a valid non-empty PDF for demo registration', () => {
    const { doc } = buildReceiptPdfDocLegacy({
      registration: demoRegistration,
      user: {
        name: demoRegistration.user_name,
        email: demoRegistration.user_email,
      },
      logoDataUrl: '',
      qrDataUrl: '',
    });

    const buf = Buffer.from(doc.output('arraybuffer'));
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('generateReceiptPdfBuffer uses legacy in production and returns valid PDF', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.RECEIPT_PDF_HTML;

    try {
      const buf = await generateReceiptPdfBuffer({
        registration: demoRegistration,
        user: {
          name: demoRegistration.user_name,
          email: demoRegistration.user_email,
        },
        logoDataUrl: '',
        appOrigin: 'https://mutalemubanga.org',
      });

      expect(isValidPdfBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(5000);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
