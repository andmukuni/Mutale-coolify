import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadReceiptPdfMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../utils/receiptPdfDownload.js', () => ({
  downloadReceiptPdf: (...args) => downloadReceiptPdfMock(...args),
  resolveReceiptSource: vi.fn((record) => (
    record.receipt_source === 'order' ? 'order' : 'registration'
  )),
}));

vi.mock('../utils/blobDownload.js', () => ({
  downloadBlob: vi.fn(),
}));

vi.mock('../../shared/receiptPdfLegacy.js', () => ({
  buildReceiptPdfDocLegacy: vi.fn(() => ({
    doc: {
      output: (type) => {
        if (type === 'arraybuffer') {
          const buf = new Uint8Array(600);
          buf.set([37, 80, 68, 70]);
          return buf.buffer;
        }
        return new Blob([new Uint8Array(600)], { type: 'application/pdf' });
      },
    },
  })),
}));

import {
  generateReceipt,
  downloadReceiptFromViewModel,
  downloadReceiptPreviewPdf,
  buildReceiptPdfBytesFromPreview,
} from '../utils/receiptPdfClient.js';
import { downloadBlob } from '../utils/blobDownload.js';

const registration = {
  id: 'reg-demo-certificate-preview',
  reference_code: 'MM-DEMO-CERT-001',
  event_title: 'ISO 15189 Laboratory Quality Systems Workshop',
  payment_status: 'not_required',
  amount_zmw: 0,
  currency: 'ZMW',
  user_name: 'Mutale Mubanga',
  user_email: 'admin@mutale.dev',
  registered_at: '2026-06-01T10:00:00.000Z',
  registration_type: 'subscription',
};

const viewModel = {
  refCode: 'MM-DEMO-CERT-001',
  logoDataUrl: 'data:image/png;base64,logo',
  qrDataUrl: 'data:image/png;base64,qr',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('receiptPdfClient', () => {
  it('generateReceipt delegates to server download helper', async () => {
    await generateReceipt(registration, { name: 'Alice' });
    expect(downloadReceiptPdfMock).toHaveBeenCalledWith(registration);
  });

  it('downloadReceiptFromViewModel uses client preview path when viewModel is populated', async () => {
    await downloadReceiptFromViewModel(viewModel, registration);
    expect(downloadReceiptPdfMock).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'Receipt-MM-DEMO-CERT-001.pdf',
    );
  });

  it('downloadReceiptFromViewModel falls back to server when viewModel is empty', async () => {
    await downloadReceiptFromViewModel({}, registration);
    expect(downloadReceiptPdfMock).toHaveBeenCalledWith(registration, {});
  });

  it('downloadReceiptPreviewPdf never calls server and uses downloadBlob', async () => {
    await downloadReceiptPreviewPdf(viewModel, registration);
    expect(downloadReceiptPdfMock).not.toHaveBeenCalled();
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(blob.size).toBeGreaterThan(500);
    expect(filename).toBe('Receipt-MM-DEMO-CERT-001.pdf');
  });

  it('buildReceiptPdfBytesFromPreview returns valid PDF bytes for demo registration', async () => {
    const bytes = await buildReceiptPdfBytesFromPreview(viewModel, registration);
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 4))).toBe('%PDF');
  });
});
