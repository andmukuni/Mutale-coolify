#!/usr/bin/env node
/**
 * Auto-test receipt PDF generation (run: node scripts/test-receipt-pdf.mjs)
 * Exits 0 when PDF bytes are valid; exits 1 on failure.
 */
import { buildReceiptPdfDocLegacy } from '../shared/receiptPdfLegacy.js';
import { generateReceiptPdfBuffer, isValidPdfBuffer } from '../shared/receiptPdf.js';

const demoRegistration = {
  reference_code: 'MM-DEMO-CERT-001',
  event_title: 'ISO 15189 Laboratory Quality Systems Workshop',
  user_name: 'Mutale Mubanga',
  user_email: 'admin@mutale.dev',
  payment_status: 'not_required',
  amount_zmw: 0,
  currency: 'ZMW',
  registered_at: '2026-06-01T10:00:00.000Z',
  registration_type: 'subscription',
  payment_method: '',
  event_id: 'evt-demo',
  event_slug: 'demo-workshop',
};

function fail(message) {
  console.error(`[test-receipt-pdf] FAIL: ${message}`);
  process.exit(1);
}

function pass(label, detail) {
  console.log(`[test-receipt-pdf] OK: ${label} — ${detail}`);
}

const { doc } = buildReceiptPdfDocLegacy({
  registration: demoRegistration,
  user: { name: demoRegistration.user_name, email: demoRegistration.user_email },
  logoDataUrl: '',
  qrDataUrl: '',
});
const legacyBuf = Buffer.from(doc.output('arraybuffer'));
if (!isValidPdfBuffer(legacyBuf)) {
  fail(`legacy PDF invalid (${legacyBuf.length} bytes)`);
}
pass('legacy jsPDF', `${legacyBuf.length} bytes, header ${legacyBuf.slice(0, 8).toString()}`);

process.env.NODE_ENV = 'production';
delete process.env.RECEIPT_PDF_HTML;

const prodBuf = await generateReceiptPdfBuffer({
  registration: demoRegistration,
  user: { name: demoRegistration.user_name, email: demoRegistration.user_email },
  logoDataUrl: '',
  appOrigin: 'https://mutalemubanga.org',
});
if (!isValidPdfBuffer(prodBuf)) {
  fail(`production path PDF invalid (${prodBuf.length} bytes)`);
}
pass('production generateReceiptPdfBuffer', `${prodBuf.length} bytes`);

console.log('[test-receipt-pdf] All checks passed.');
