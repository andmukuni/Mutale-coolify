import { downloadReceiptPdf } from './receiptPdfDownload.js';
import { buildReceiptPdfDocLegacy } from '../../shared/receiptPdfLegacy.js';
import { downloadBlob } from './blobDownload.js';

const MIN_PDF_BYTES = 500;

function buildFallbackFilename(registration = {}) {
  const refCode = registration.reference_code || registration.payment_reference || 'download';
  const safeRef = String(refCode).replace(/[^a-zA-Z0-9-_]/g, '-');
  return `Receipt-${safeRef}.pdf`;
}

function resolveReceiptUser(registration = {}, user = {}) {
  return {
    name: user.name || registration.user_name || registration.booked_for_name || 'Customer',
    email: user.email || registration.user_email || '',
    phone: user.phone || registration.user_phone || '',
  };
}

async function resolveImageUrlToDataUrl(src = '') {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;

  const res = await fetch(value);
  if (!res.ok) return '';
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read receipt logo.'));
    reader.readAsDataURL(blob);
  });
}

export function buildReceiptPdfBytes({ registration, user = {}, logoDataUrl = '', qrDataUrl = '' }) {
  const { doc } = buildReceiptPdfDocLegacy({
    registration,
    user: resolveReceiptUser(registration, user),
    logoDataUrl,
    qrDataUrl,
  });

  const bytes = doc.output('arraybuffer');
  if (!bytes || bytes.byteLength < MIN_PDF_BYTES) {
    throw new Error('Could not generate receipt PDF on this device.');
  }
  return bytes;
}

/**
 * Build receipt PDF bytes from the preview view model (browser jsPDF).
 * @param {object} viewModel
 * @param {object} registration
 * @param {object} [user]
 */
export async function buildReceiptPdfBytesFromPreview(viewModel, registration, user = {}) {
  let logoDataUrl = viewModel?.logoDataUrl || '';
  if (logoDataUrl && !logoDataUrl.startsWith('data:')) {
    try {
      logoDataUrl = await resolveImageUrlToDataUrl(logoDataUrl);
    } catch {
      logoDataUrl = '';
    }
  }

  return buildReceiptPdfBytes({
    registration,
    user,
    logoDataUrl,
    qrDataUrl: viewModel?.qrDataUrl || '',
  });
}

function saveReceiptPdfBytes(bytes, filename) {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename);
}

/**
 * Download receipt PDF from preview view model — client-side only (no server round-trip).
 */
export async function downloadReceiptPreviewPdf(viewModel, registration, opts = {}) {
  const filename = opts.filename || buildFallbackFilename(registration);
  const bytes = await buildReceiptPdfBytesFromPreview(
    viewModel,
    registration,
    opts.user || {},
  );
  saveReceiptPdfBytes(bytes, filename);
}

async function downloadReceiptLegacyFallback(registration, user = {}, viewModel = null) {
  let logoDataUrl = viewModel?.logoDataUrl || '';
  if (logoDataUrl && !logoDataUrl.startsWith('data:')) {
    try {
      logoDataUrl = await resolveImageUrlToDataUrl(logoDataUrl);
    } catch {
      logoDataUrl = '';
    }
  }

  const bytes = buildReceiptPdfBytes({
    registration,
    user,
    logoDataUrl,
    qrDataUrl: viewModel?.qrDataUrl || '',
  });

  saveReceiptPdfBytes(bytes, buildFallbackFilename(registration));
}

/**
 * @param {object} registration
 * @param {object} [_user]
 * @returns {Promise<void>}
 */
export async function generateReceipt(registration, _user) {
  try {
    await downloadReceiptPdf(registration);
  } catch (error) {
    console.warn('[receipt] Server download failed, using client fallback:', error?.message || error);
    await downloadReceiptLegacyFallback(registration, _user || {});
  }
}

/**
 * @param {object} viewModel
 * @param {object} registration
 * @param {{ filename?: string, user?: object }} [opts]
 */
export async function downloadReceiptFromViewModel(viewModel, registration, opts = {}) {
  if (viewModel && Object.keys(viewModel).length > 0) {
    return downloadReceiptPreviewPdf(viewModel, registration, opts);
  }

  try {
    await downloadReceiptPdf(registration, opts);
  } catch (error) {
    console.warn('[receipt] Server download failed, using client fallback:', error?.message || error);
    await downloadReceiptLegacyFallback(registration, opts.user || {}, viewModel);
  }
}
