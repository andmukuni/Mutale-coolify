import { jsPDF } from 'jspdf';
import {
  generateCertificatePdfFromTemplate,
  isValidCertificatePdfBuffer,
  renderCertificateTemplateContent,
} from './certificatePdf.js';
import { formatEventDateRange } from './certificateDesign.js';
import { resolveAttendeeName } from './ticketViewModel.js';
import { registerCertificatePdfFonts } from './certificatePdfFonts.js';

export { isValidCertificatePdfBuffer };

export const BADGE_WIDTH_MM = 152.4;
export const BADGE_HEIGHT_MM = 203.2;
const PRINT_SHEET_WIDTH_MM = 431.8;
const PRINT_SHEET_HEIGHT_MM = 279.4;

export function buildBadgeDataForRegistration(registration = {}, event = {}) {
  const refCode = String(registration.reference_code || '').trim();
  return {
    attendee_name: resolveAttendeeName(registration),
    event_name: String(event.title || registration.event_title || 'Event').trim(),
    event_date: formatEventDateRange(event),
    reference_code: refCode,
    certificate_number: refCode,
    issue_date: new Date().toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export async function generateBadgePdfFromTemplate(template, data = {}, opts = {}) {
  return generateCertificatePdfFromTemplate(template, data, opts);
}

/**
 * Two 6×8 inch badges per tabloid landscape sheet for batch printing.
 */
export async function generateBadgePrintSheetPdf(template, registrations = [], opts = {}) {
  const { event = {}, appRoot = '', appOrigin = '' } = opts;
  if (!template || registrations.length === 0) {
    throw new Error('Template and at least one registration are required.');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PRINT_SHEET_WIDTH_MM, PRINT_SHEET_HEIGHT_MM],
  });
  await registerCertificatePdfFonts(doc, appRoot);

  const gapX = (PRINT_SHEET_WIDTH_MM - BADGE_WIDTH_MM * 2) / 3;
  const offsetY = (PRINT_SHEET_HEIGHT_MM - BADGE_HEIGHT_MM) / 2;
  const positions = [
    { x: gapX, y: offsetY },
    { x: gapX * 2 + BADGE_WIDTH_MM, y: offsetY },
  ];

  for (let i = 0; i < registrations.length; i += 1) {
    if (i > 0 && i % 2 === 0) {
      doc.addPage([PRINT_SHEET_WIDTH_MM, PRINT_SHEET_HEIGHT_MM], 'landscape');
    }
    const pos = positions[i % 2];
    const data = buildBadgeDataForRegistration(registrations[i], event);
    await renderCertificateTemplateContent(doc, template, data, { appRoot, appOrigin }, {
      pageW: BADGE_WIDTH_MM,
      pageH: BADGE_HEIGHT_MM,
      offsetX: pos.x,
      offsetY: pos.y,
    });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
