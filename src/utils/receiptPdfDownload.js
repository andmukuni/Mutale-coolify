import { getApiBase } from './apiBase.js';
import { getSessionAuthHeaders } from './authHeaders.js';
import { downloadBlob } from './blobDownload.js';

const RECEIPT_DOWNLOAD_TIMEOUT_MS = 15000;

/**
 * @param {object} record
 * @returns {'registration' | 'order' | 'cv'}
 */
export function resolveReceiptSource(record = {}) {
  if (record.receipt_source === 'cv' || record.receipt_source === 'order' || record.receipt_source === 'registration') {
    return record.receipt_source;
  }
  if (String(record.receipt_type || '').toLowerCase() === 'cv') return 'cv';
  if (Array.isArray(record.items) && record.items.length > 0) return 'order';
  return 'registration';
}

function buildReceiptDownloadFilename(record = {}) {
  const refCode = record.reference_code || record.payment_reference || 'download';
  const safeRef = String(refCode).replace(/[^a-zA-Z0-9-_]/g, '-');
  return `Receipt-${safeRef}.pdf`;
}

function parseFilenameFromDisposition(header = '') {
  const match = /filename="([^"]+)"/i.exec(String(header));
  return match?.[1] || '';
}

const MIN_PDF_BYTES = 500;

async function assertValidPdfBlob(blob) {
  if (!blob || blob.size < MIN_PDF_BYTES) {
    throw new Error('Server returned an empty or invalid receipt PDF.');
  }
  const header = await blob.slice(0, 4).text();
  if (header !== '%PDF') {
    throw new Error('Server returned an invalid receipt PDF.');
  }
}

/**
 * Download receipt PDF from server (preview-identical HTML render).
 * @param {object} record
 * @param {{ fileHandle?: FileSystemFileHandle | null }} [opts]
 */
export async function downloadReceiptPdf(record, opts = {}) {
  const source = resolveReceiptSource(record);
  const id = source === 'cv'
    ? (record?.reference_code || record?.payment_reference || record?.id)
    : record?.id;
  if (!id) throw new Error('Receipt record id is required for download.');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, RECEIPT_DOWNLOAD_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(
      `${getApiBase()}/receipts/${encodeURIComponent(source)}/${encodeURIComponent(id)}/pdf`,
      {
        headers: getSessionAuthHeaders(),
        cache: 'no-store',
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Receipt download timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || json?.error || 'Could not download receipt PDF.');
  }

  const blob = await res.blob();
  await assertValidPdfBlob(blob);
  const filename = parseFilenameFromDisposition(res.headers.get('Content-Disposition'))
    || buildReceiptDownloadFilename(record);

  downloadBlob(blob, filename);
}
