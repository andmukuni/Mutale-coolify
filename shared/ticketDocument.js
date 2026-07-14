import { buildTicketQrDataUrl } from './ticketQr.js';
import { generateTicketPdfBlob } from './ticketPdf.js';

export {
  resolveAttendeeName,
  isGuestTicket,
  isTicketPaymentEligible,
  isInPersonEventRecord,
  buildTicketViewModel,
} from './ticketViewModel.js';

export { renderTicketDocumentHtml } from './ticketDocumentHtml.js';
export { buildTicketFilename } from './ticketPdf.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} options
 * @param {object} options.registration
 * @param {object} [options.event]
 * @param {string} [options.appOrigin]
 */
export async function downloadTicketPdf(options = {}) {
  const ref = String(options.registration?.reference_code || 'ticket').trim();
  const blob = await generateTicketPdfBlob(options);
  downloadBlob(blob, `ticket-${ref}.pdf`);
}

/**
 * @param {string} referenceCode
 * @param {string} appOrigin
 */
export async function downloadTicketQrPng(referenceCode = '', appOrigin = '') {
  const ref = String(referenceCode || '').trim();
  if (!ref) throw new Error('Ticket reference is required.');
  const dataUrl = await buildTicketQrDataUrl(ref, appOrigin, { size: 512 });
  if (!dataUrl) throw new Error('Could not generate QR code.');
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = `ticket-qr-${ref}.png`;
  anchor.click();
}
