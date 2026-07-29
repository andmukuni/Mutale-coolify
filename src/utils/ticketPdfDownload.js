import { getApiBase } from './apiBase.js';
import { getSessionAuthHeaders } from './authHeaders.js';
import { downloadBlob } from './blobDownload.js';

const TICKET_DOWNLOAD_TIMEOUT_MS = 20000;
const MIN_PDF_BYTES = 500;

function buildTicketDownloadFilename(registration = {}) {
  const ref = String(registration.reference_code || 'ticket').replace(/[^a-zA-Z0-9-_]/g, '-');
  return `Ticket-${ref}.pdf`;
}

function parseFilenameFromDisposition(header = '') {
  const match = /filename="([^"]+)"/i.exec(String(header));
  return match?.[1] || '';
}

async function assertValidPdfBlob(blob) {
  if (!blob || blob.size < MIN_PDF_BYTES) {
    throw new Error('Server returned an empty or invalid ticket PDF.');
  }
  const header = await blob.slice(0, 4).text();
  if (header !== '%PDF') {
    throw new Error('Server returned an invalid ticket PDF.');
  }
}

/**
 * Download branded ticket PDF from the server (same HTML design as email attachments).
 * @param {object} registration
 */
export async function downloadTicketPdfFromServer(registration = {}) {
  const id = registration?.id;
  if (!id) throw new Error('Registration id is required for ticket download.');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, TICKET_DOWNLOAD_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(
      `${getApiBase()}/registrations/${encodeURIComponent(id)}/ticket/pdf`,
      {
        headers: getSessionAuthHeaders(),
        cache: 'no-store',
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Ticket download timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || json?.error || 'Could not download ticket PDF.');
  }

  const blob = await res.blob();
  await assertValidPdfBlob(blob);
  const filename = parseFilenameFromDisposition(res.headers.get('Content-Disposition'))
    || buildTicketDownloadFilename(registration);

  downloadBlob(blob, filename);
}
