import { buildPublicEventPageUrl } from '../../shared/receiptQr.js';
import { formatPrice } from './eventServices.js';
import { formatDate, formatTime } from './helpers.js';
import { getAppOrigin } from './apiBase.js';

/**
 * @param {object} event
 * @param {string} publicUrl
 * @returns {{ title: string, text: string, url: string }}
 */
export function buildEventSharePayload(event = {}, publicUrl = '') {
  const title = String(event.title || 'Event').trim();
  const dateStr = formatDate(event.start_date || event.date);
  const timeStr = formatTime(event.start_time || event.time);
  const when = timeStr ? `${dateStr} at ${timeStr}` : dateStr;

  const location = String(event.location || '').trim();
  const mode = String(event.event_mode || '').toLowerCase();
  const where = location
    || (mode === 'virtual' ? 'Online event' : '');

  const priceLine = formatPrice(event);
  const category = event.category ? String(event.category) : '';

  const lines = [
    title,
    when,
    where,
    category && `Category: ${category}`,
    priceLine && `Registration: ${priceLine}`,
    '',
    'View event details and register now:',
    publicUrl,
  ].filter((line) => line !== false && line !== '');

  return {
    title,
    text: lines.join('\n'),
    url: publicUrl,
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob|null>}
 */
async function qrDataUrlToBlob(dataUrl) {
  if (!dataUrl?.startsWith('data:')) return null;
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Native share (or clipboard fallback) for a public event page.
 * @param {object} event
 * @param {{ appOrigin?: string, qrDataUrl?: string }} [opts]
 * @returns {Promise<'share'|'clipboard'>}
 */
export async function sharePublicEvent(event = {}, opts = {}) {
  const origin = opts.appOrigin ?? getAppOrigin();
  const publicUrl = buildPublicEventPageUrl(event, origin);
  if (!publicUrl) {
    throw new Error('Save the event with a slug or ID before sharing.');
  }

  const { title, text, url } = buildEventSharePayload(event, publicUrl);

  if (typeof navigator.share !== 'function') {
    await navigator.clipboard.writeText(text);
    return 'clipboard';
  }

  const qrBlob = opts.qrDataUrl ? await qrDataUrlToBlob(opts.qrDataUrl) : null;
  if (qrBlob && typeof navigator.canShare === 'function') {
    const file = new File([qrBlob], 'event-qr.png', { type: 'image/png' });
    const withFiles = { title, text, url, files: [file] };
    if (navigator.canShare(withFiles)) {
      await navigator.share(withFiles);
      return 'share';
    }
  }

  try {
    await navigator.share({ title, text, url });
    return 'share';
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    await navigator.clipboard.writeText(text);
    return 'clipboard';
  }
}
