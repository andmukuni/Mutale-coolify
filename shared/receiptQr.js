import QRCode from 'qrcode';
import { resolveReceiptType } from './receiptHelpers.js';

/**
 * Public event details page URL (slug preferred, else id).
 * @param {object} event - Event or registration row with slug/id fields
 * @param {string} appOrigin - Site origin without trailing slash
 * @returns {string|null}
 */
export function buildPublicEventPageUrl(event = {}, appOrigin = '') {
  const origin = String(appOrigin || '').trim().replace(/\/$/, '');
  if (!origin) return null;

  const segment = String(
    event.slug || event.event_slug || event.id || event.event_id || '',
  ).trim();
  if (!segment) return null;

  return `${origin}/events/${encodeURIComponent(segment)}`;
}

/**
 * Public event page URL for event receipts (scan target).
 * @param {object} record
 * @param {string} appOrigin - Site origin without trailing slash
 * @returns {string|null}
 */
export function buildEventReceiptQrUrl(record = {}, appOrigin = '') {
  if (resolveReceiptType(record) !== 'event') return null;
  return buildPublicEventPageUrl({
    slug: record.event_slug,
    id: record.event_id,
  }, appOrigin);
}

/**
 * @param {string} url
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function generateReceiptQrDataUrl(url, { size = 200 } = {}) {
  if (!url) return '';
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * @param {object} record
 * @param {string} appOrigin
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>} PNG data URL or empty string
 */
export async function buildEventReceiptQrDataUrl(record = {}, appOrigin = '', opts = {}) {
  const url = buildEventReceiptQrUrl(record, appOrigin);
  if (!url) return '';
  try {
    return await generateReceiptQrDataUrl(url, opts);
  } catch {
    return '';
  }
}

/**
 * QR data URL for an event's public page (admin share card, receipts).
 * @param {object} event
 * @param {string} appOrigin
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function buildPublicEventQrDataUrl(event = {}, appOrigin = '', opts = {}) {
  const url = buildPublicEventPageUrl(event, appOrigin);
  if (!url) return '';
  try {
    return await generateReceiptQrDataUrl(url, opts);
  } catch {
    return '';
  }
}
