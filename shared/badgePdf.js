import { jsPDF } from 'jspdf';
import {
  generateCertificatePdfFromTemplate,
  isValidCertificatePdfBuffer,
  renderCertificateTemplateContent,
} from './certificatePdf.js';
import { formatBadgeEventDate } from './certificateDesign.js';
import {
  resolveAttendeeName,
  resolveEventLocation,
  resolvePayerName,
} from './ticketViewModel.js';
import { registerCertificatePdfFonts } from './certificatePdfFonts.js';

export { isValidCertificatePdfBuffer };

/** 6" × 8" portrait badge. */
export const BADGE_WIDTH_MM = 152.4;
export const BADGE_HEIGHT_MM = 203.2;

/** A4 landscape — two 6×8 badges fit with a small scale-to-page. */
export const A4_LANDSCAPE_WIDTH_MM = 297;
export const A4_LANDSCAPE_HEIGHT_MM = 210;

export function buildBadgeDataForRegistration(registration = {}, event = {}) {
  const refCode = String(registration.reference_code || '').trim();
  return {
    attendee_name: resolveAttendeeName(registration),
    event_name: String(event.title || registration.event_title || 'Event').trim(),
    event_date: formatBadgeEventDate(event),
    event_location: resolveEventLocation(event, registration),
    purchaser_name: resolvePayerName(registration),
    reference_code: refCode,
    certificate_number: refCode,
    issue_date: new Date().toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export function getBadgeA4SheetLayout({
  sheetW = A4_LANDSCAPE_WIDTH_MM,
  sheetH = A4_LANDSCAPE_HEIGHT_MM,
  marginMm = 4,
  gutterMm = 4,
} = {}) {
  const availableW = Math.max(1, sheetW - marginMm * 2 - gutterMm);
  const availableH = Math.max(1, sheetH - marginMm * 2);
  const scale = Math.min(
    (availableW / 2) / BADGE_WIDTH_MM,
    availableH / BADGE_HEIGHT_MM,
    1,
  );
  const badgeW = BADGE_WIDTH_MM * scale;
  const badgeH = BADGE_HEIGHT_MM * scale;
  const totalW = badgeW * 2 + gutterMm;
  const startX = (sheetW - totalW) / 2;
  const startY = (sheetH - badgeH) / 2;
  return {
    orientation: 'landscape',
    sheetW,
    sheetH,
    scale,
    badgeW,
    badgeH,
    gutterMm,
    positions: [
      { x: startX, y: startY },
      { x: startX + badgeW + gutterMm, y: startY },
    ],
  };
}

export async function generateBadgePdfFromTemplate(template, data = {}, opts = {}) {
  return generateCertificatePdfFromTemplate(template, data, opts);
}

function drawA4CutGuide(doc, layout) {
  const midX = layout.positions[0].x + layout.badgeW + layout.gutterMm / 2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.18);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([1.6, 1.2], 0);
  }
  doc.line(midX, 5, midX, layout.sheetH - 5);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([], 0);
  }
}

/**
 * Two 6×8 inch badges per A4 landscape sheet for batch printing.
 */
export async function generateBadgePrintSheetPdf(template, registrations = [], opts = {}) {
  const { event = {}, appRoot = '', appOrigin = '' } = opts;
  if (!template || registrations.length === 0) {
    throw new Error('Template and at least one registration are required.');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  await registerCertificatePdfFonts(doc, appRoot);

  const sheetW = doc.internal.pageSize.getWidth();
  const sheetH = doc.internal.pageSize.getHeight();
  const layout = getBadgeA4SheetLayout({ sheetW, sheetH });

  for (let i = 0; i < registrations.length; i += 1) {
    if (i > 0 && i % 2 === 0) {
      doc.addPage('a4', 'landscape');
      drawA4CutGuide(doc, layout);
    } else if (i === 0) {
      drawA4CutGuide(doc, layout);
    }
    const pos = layout.positions[i % 2];
    const data = buildBadgeDataForRegistration(registrations[i], event);
    await renderCertificateTemplateContent(doc, template, data, { appRoot, appOrigin }, {
      pageW: layout.badgeW,
      pageH: layout.badgeH,
      offsetX: pos.x,
      offsetY: pos.y,
    });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
