import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./certificateQr.js', () => ({
  buildCertificateQrDataUrl: vi.fn().mockResolvedValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVQImWNgYAAAAAIAAW4Q7hYAAAAASUVORK5CYII=',
  ),
}));

import {
  buildDefaultCertificateDesign,
  buildSamplePreviewData,
  buildDesignFromPreset,
  CERTIFICATE_PRESET_ACHIEVEMENT,
} from './certificateDesign.js';
import {
  generateCertificatePdfFromTemplate,
  isValidCertificatePdfBuffer,
} from './certificatePdf.js';

describe('certificatePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a valid PDF buffer from template design', async () => {
    const design = buildDefaultCertificateDesign({ title: 'Test Event' });
    const data = buildSamplePreviewData({ title: 'Test Event' });

    const buffer = await generateCertificatePdfFromTemplate(
      {
        design_json: design,
        orientation: 'landscape',
        paper_size: 'A4',
      },
      data,
      { appOrigin: 'http://localhost:5173', appRoot: process.cwd() },
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(500);
    expect(isValidCertificatePdfBuffer(buffer)).toBe(true);
  });

  it('rejects invalid design', async () => {
    await expect(
      generateCertificatePdfFromTemplate({ design_json: null }, {}),
    ).rejects.toThrow(/invalid/i);
  });

  it('generates PDF with italic, underline, and highlight styles', async () => {
    const design = buildDefaultCertificateDesign({ title: 'Styled Event' });
    design.elements = design.elements.map((el) => (
      el.id === 'el_attendee'
        ? {
          ...el,
          style: {
            ...el.style,
            italic: true,
            underline: true,
            highlight: '#fef08a',
            color: '#102a43',
          },
        }
        : el
    ));
    const data = buildSamplePreviewData({ title: 'Styled Event' });

    const buffer = await generateCertificatePdfFromTemplate(
      {
        design_json: design,
        orientation: 'landscape',
        paper_size: 'A4',
      },
      data,
      { appOrigin: 'http://localhost:5173', appRoot: process.cwd() },
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(isValidCertificatePdfBuffer(buffer)).toBe(true);
  });

  it('generates achievement template PDF with ornate image background', async () => {
    const design = buildDesignFromPreset(CERTIFICATE_PRESET_ACHIEVEMENT, { title: 'Summit' });
    const data = buildSamplePreviewData({ title: 'Summit' });

    const buffer = await generateCertificatePdfFromTemplate(
      {
        design_json: design,
        orientation: 'landscape',
        paper_size: 'A4',
      },
      data,
      { appOrigin: 'http://localhost:5173', appRoot: process.cwd() },
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(5000);
    expect(isValidCertificatePdfBuffer(buffer)).toBe(true);
  });
});
