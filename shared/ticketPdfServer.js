import { buildTicketViewModel } from './ticketViewModel.js';
import {
  buildTicketFilename,
  generateLegacyTicketPdfBuffer,
  isValidTicketPdfBuffer,
} from './ticketPdf.js';

export { buildTicketFilename, isValidTicketPdfBuffer } from './ticketPdf.js';

function shouldUseLegacyPdf() {
  // Prefer branded HTML PDF (Puppeteer). Force legacy only with TICKET_PDF_LEGACY=1.
  return String(process.env.TICKET_PDF_LEGACY || '').trim() === '1';
}

/**
 * Server-side ticket PDF buffer (HTML snapshot with Puppeteer, legacy fallback).
 * @param {{ registration: object, event?: object, appOrigin?: string, logoDataUrl?: string }} payload
 * @returns {Promise<Buffer>}
 */
export async function generateTicketPdfBuffer(payload = {}) {
  const { registration, event = {}, appOrigin = '', logoDataUrl = '' } = payload;

  if (shouldUseLegacyPdf()) {
    return generateLegacyTicketPdfBuffer(payload);
  }

  try {
    const viewModel = await buildTicketViewModel({
      registration,
      event,
      appOrigin,
      logoDataUrl,
    });
    const { captureTicketViewModelToPdfBuffer } = await import('./ticketSnapshotHtml.js');
    const buf = await captureTicketViewModelToPdfBuffer(viewModel);
    if (!isValidTicketPdfBuffer(buf)) {
      throw new Error('Ticket HTML PDF generation produced an invalid buffer.');
    }
    return buf;
  } catch (err) {
    if (String(process.env.TICKET_PDF_HTML || '').trim() === '1') throw err;
    return generateLegacyTicketPdfBuffer(payload);
  }
}
