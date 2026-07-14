import { generateTicketPdfBlobLegacy } from './ticketDocumentLegacy.js';

const MIN_PDF_BYTES = 500;

export function isValidTicketPdfBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < MIN_PDF_BYTES) return false;
  return buf.slice(0, 4).toString('ascii') === '%PDF';
}

export function buildTicketFilename(registration = {}) {
  const ref = String(registration.reference_code || 'ticket').replace(/[^a-zA-Z0-9-_]/g, '-');
  return `Ticket-${ref}.pdf`;
}

/**
 * Client-safe legacy PDF generation (jsPDF).
 * @param {{ registration: object, event?: object, appOrigin?: string }} payload
 */
export async function generateTicketPdfBlob(payload = {}) {
  const { registration, event = {}, appOrigin = '' } = payload;
  return generateTicketPdfBlobLegacy({ registration, event, appOrigin });
}

export async function generateLegacyTicketPdfBuffer(payload = {}) {
  const { registration, event = {}, appOrigin = '' } = payload;
  const blob = await generateTicketPdfBlobLegacy({ registration, event, appOrigin });
  const buf = Buffer.from(await blob.arrayBuffer());
  if (!isValidTicketPdfBuffer(buf)) {
    throw new Error('Legacy ticket PDF generation produced an invalid buffer.');
  }
  return buf;
}
