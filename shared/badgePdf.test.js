import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./certificateQr.js', () => ({
  buildCertificateQrDataUrl: vi.fn().mockResolvedValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVQImWNgYAAAAAIAAW4Q7hYAAAAASUVORK5CYII=',
  ),
}));

vi.mock('./ticketQr.js', () => ({
  buildTicketQrDataUrl: vi.fn().mockResolvedValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVQImWNgYAAAAAIAAW4Q7hYAAAAASUVORK5CYII=',
  ),
  buildTicketScanUrl: vi.fn((code) => `https://example.test/t/${code}`),
}));

import { buildDefaultBadgeDesign } from './certificateDesign.js';
import { isValidCertificatePdfBuffer } from './certificatePdf.js';
import {
  getBadgeA4SheetLayout,
  BADGE_WIDTH_MM,
  BADGE_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  A4_LANDSCAPE_HEIGHT_MM,
  buildBadgeDataForRegistration,
  generateBadgePrintSheetPdf,
} from './badgePdf.js';

describe('badgePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fits two 6x8 badges on an A4 landscape sheet', () => {
    const layout = getBadgeA4SheetLayout();
    expect(layout.sheetW).toBe(A4_LANDSCAPE_WIDTH_MM);
    expect(layout.sheetH).toBe(A4_LANDSCAPE_HEIGHT_MM);
    expect(layout.positions).toHaveLength(2);
    expect(layout.scale).toBeLessThanOrEqual(1);
    expect(layout.badgeW).toBeLessThanOrEqual(BADGE_WIDTH_MM);
    expect(layout.badgeH).toBeLessThanOrEqual(BADGE_HEIGHT_MM);
    expect(layout.positions[0].x).toBeGreaterThanOrEqual(0);
    expect(layout.positions[1].x + layout.badgeW).toBeLessThanOrEqual(layout.sheetW + 0.05);
    expect(layout.positions[0].y + layout.badgeH).toBeLessThanOrEqual(layout.sheetH + 0.05);
    expect(layout.positions[1].x).toBeGreaterThan(layout.positions[0].x + layout.badgeW);
  });

  it('maps registration fields onto badge placeholders', () => {
    const data = buildBadgeDataForRegistration(
      {
        booked_for_name: 'Chile',
        user_name: 'MUTALE MUBANGA',
        reference_code: 'REG-1784223544138-RB6JQ5',
      },
      {
        title: 'Zambia Digital Business Summit 2026',
        location: 'Lusaka, Zambia',
        start_date: '2026-07-24',
        start_time: '20:00',
      },
    );
    expect(data.attendee_name).toBe('Chile');
    expect(data.event_name).toContain('Zambia Digital');
    expect(data.purchaser_name).toBe('MUTALE MUBANGA');
    expect(data.event_location).toBe('Lusaka, Zambia');
    expect(data.reference_code).toBe('REG-1784223544138-RB6JQ5');
    expect(data.event_date).toContain('20:00');
  });

  it('generates a valid A4 PDF with two badges per page', async () => {
    const template = {
      design_json: buildDefaultBadgeDesign({ title: 'Summit', location: 'Lusaka' }),
      orientation: 'portrait',
      paper_size: '6x8',
    };
    const buffer = await generateBadgePrintSheetPdf(
      template,
      [
        { booked_for_name: 'Ada', user_name: 'Payer One', reference_code: 'R1' },
        { booked_for_name: 'Ben', user_name: 'Payer One', reference_code: 'R2' },
        { booked_for_name: 'Cara', user_name: 'Payer Two', reference_code: 'R3' },
      ],
      {
        event: { title: 'Summit', location: 'Lusaka', start_date: '2026-07-24' },
        appOrigin: 'http://localhost:5173',
        appRoot: process.cwd(),
      },
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(isValidCertificatePdfBuffer(buffer)).toBe(true);
    const pdf = buffer.toString('latin1');
    expect(pdf).toContain('/Count 2');
    expect(pdf).toMatch(/\/MediaBox \[0 0 841\./);
  });
});
