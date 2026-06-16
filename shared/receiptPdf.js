import { buildEventReceiptQrDataUrl } from './receiptQr.js';
import { buildReceiptViewModel } from './receiptViewModel.js';
import { generateReceiptPdfBufferLegacy } from './receiptPdfLegacy.js';

export { isReceiptEligible, formatReceiptDisplayNumber } from './receiptNumbers.js';

export function buildReceiptPayload(registration = {}, user = {}) {
  return { registration, user };
}

/**
 * @deprecated Use generateReceiptPdfBuffer (snapshot). Kept for tests referencing doc builder.
 */
export { buildReceiptPdfDocLegacy as buildReceiptPdfDoc } from './receiptPdfLegacy.js';

const MIN_PDF_BYTES = 500;

function shouldUseLegacyPdf() {
  return String(process.env.RECEIPT_PDF_LEGACY || '').trim() === '1'
    || (process.env.NODE_ENV === 'production'
      && String(process.env.RECEIPT_PDF_HTML || '').trim() !== '1');
}

export function isValidPdfBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < MIN_PDF_BYTES) return false;
  return buf.slice(0, 4).toString('ascii') === '%PDF';
}

async function generateLegacyPdfBuffer({
  registration,
  user,
  logoDataUrl,
  appOrigin,
  qrIn,
}) {
  let qrDataUrl = qrIn || '';
  if (!qrDataUrl && appOrigin) {
    qrDataUrl = await buildEventReceiptQrDataUrl(registration, appOrigin, { size: 200 });
  }
  return generateReceiptPdfBufferLegacy({
    registration,
    user,
    logoDataUrl,
    qrDataUrl,
  }).then((buf) => {
    if (!isValidPdfBuffer(buf)) {
      throw new Error('Legacy receipt PDF generation produced an invalid buffer.');
    }
    return buf;
  });
}

/**
 * Generate PDF buffer from receipt preview HTML, with legacy jsPDF fallback.
 * @param {{ registration: object, user?: object, logoDataUrl?: string, appOrigin?: string, qrDataUrl?: string }} payload
 */
export async function generateReceiptPdfBuffer(payload = {}) {
  const {
    registration,
    user,
    logoDataUrl,
    appOrigin,
    qrDataUrl: qrIn,
  } = payload;

  if (shouldUseLegacyPdf()) {
    return generateLegacyPdfBuffer({
      registration,
      user,
      logoDataUrl,
      appOrigin,
      qrIn,
    });
  }

  try {
    const viewModel = await buildReceiptViewModel({
      registration,
      user,
      appOrigin,
      logoDataUrl,
      qrDataUrl: qrIn,
    });

    const { getReceiptLogoFileUrl } = await import('./receiptLogoAsset.js');
    const logoFileUrl = await getReceiptLogoFileUrl();
    const httpLogoUrl = appOrigin
      ? `${String(appOrigin).replace(/\/$/, '')}/api/receipts/logo.png`
      : '';
    const pdfLogoSrc = logoDataUrl || logoFileUrl || httpLogoUrl;
    const pdfViewModel = pdfLogoSrc
      ? { ...viewModel, logoDataUrl: pdfLogoSrc }
      : viewModel;

    const { captureViewModelToPdfBuffer } = await import('./receiptSnapshotHtml.js');
    const pdfBuffer = await captureViewModelToPdfBuffer(pdfViewModel);

    if (!isValidPdfBuffer(pdfBuffer)) {
      console.warn('[receipt] HTML PDF returned invalid buffer, using legacy layout');
      return generateLegacyPdfBuffer({
        registration,
        user,
        logoDataUrl,
        appOrigin,
        qrIn,
      });
    }

    return pdfBuffer;
  } catch (err) {
    console.warn('[receipt] HTML PDF failed, using legacy layout:', err.message);
    return generateLegacyPdfBuffer({
      registration,
      user,
      logoDataUrl,
      appOrigin,
      qrIn,
    });
  }
}