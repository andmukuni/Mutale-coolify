import { describe, it, expect, vi, beforeEach } from 'vitest';

const pdfMock = vi.fn().mockResolvedValue(Buffer.from('%PDF-mock'));
const evaluateMock = vi.fn()
  .mockResolvedValueOnce(undefined)
  .mockResolvedValueOnce(900);
const setContentMock = vi.fn().mockResolvedValue(undefined);
const closePageMock = vi.fn().mockResolvedValue(undefined);
const newPageMock = vi.fn().mockResolvedValue({
  setViewport: vi.fn().mockResolvedValue(undefined),
  setContent: setContentMock,
  evaluate: evaluateMock,
  pdf: pdfMock,
  close: closePageMock,
});
const launchMock = vi.fn().mockResolvedValue({ newPage: newPageMock });

vi.mock('puppeteer', () => ({
  default: {
    launch: (...args) => launchMock(...args),
  },
}));

vi.mock('./receiptRender.js', () => ({
  renderReceiptMarkup: vi.fn((viewModel, opts) => `<html>${opts?.outerPadding}</html>`),
}));

import { captureViewModelToPdfBuffer, closeReceiptPdfBrowser } from './receiptSnapshotHtml.js';
import { renderReceiptMarkup } from './receiptRender.js';

describe('captureViewModelToPdfBuffer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closeReceiptPdfBrowser();
    evaluateMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(900);
  });

  it('renders preview HTML with outerPadding false and returns PDF buffer', async () => {
    const buf = await captureViewModelToPdfBuffer({ refCode: 'MM-1' });
    expect(renderReceiptMarkup).toHaveBeenCalledWith(
      { refCode: 'MM-1' },
      { outerPadding: false },
    );
    expect(setContentMock).toHaveBeenCalledWith(
      expect.any(String),
      { waitUntil: 'load' },
    );
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      userDataDir: expect.stringContaining('mutale-receipt-pdf-'),
    }));
    expect(pdfMock).toHaveBeenCalledWith(expect.objectContaining({
      printBackground: true,
      width: '672px',
      height: '900px',
    }));
    expect(buf.toString()).toBe('%PDF-mock');
  });
});
