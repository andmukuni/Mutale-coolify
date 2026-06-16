import { jsPDF } from 'jspdf';
import {
  buildReceiptDetailRows,
  getReceiptLineItemDescription,
} from './receiptHelpers.js';
import {
  RECEIPT_PALETTE,
  RECEIPT_LIGHT_FILL,
  RECEIPT_LIGHT_BOX,
  RECEIPT_BORDER,
} from './receiptTheme.js';
import { formatReceiptDisplayNumber } from './receiptNumbers.js';

const { navy: NAVY, teal: TEAL, coral: CORAL } = RECEIPT_PALETTE;

function formatCurrency(amount, currency = 'ZMW') {
  const num = Number(amount || 0);
  return `${currency.toUpperCase()} ${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' });
}

function titleCase(str = '') {
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveBilledTo(registration = {}, user = {}) {
  return {
    name: user?.name || registration.user_name || '—',
    email: user?.email || registration.user_email || '',
    phone: user?.phone || registration.user_phone || '',
  };
}

/**
 * Legacy jsPDF drawer (fallback when HTML snapshot fails on server).
 */
export function buildReceiptPdfDocLegacy({
  registration = {},
  user = {},
  logoDataUrl = '',
  qrDataUrl = '',
} = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  const refCode = registration.reference_code || registration.payment_reference || '—';
  const receiptNo = formatReceiptDisplayNumber(registration);
  const billed = resolveBilledTo(registration, user);
  const amountZmw = registration.amount_zmw ?? registration.amount ?? 0;
  const currency = (registration.currency || 'ZMW').toUpperCase();
  const headerH = 42;
  const accentH = 2.5;

  doc.setFillColor(NAVY);
  doc.rect(0, 0, pw, headerH, 'F');

  let brandX = 14;
  if (logoDataUrl) {
    try {
      const imageData = logoDataUrl.includes(',')
        ? logoDataUrl.slice(logoDataUrl.indexOf(',') + 1)
        : logoDataUrl;
      doc.addImage(imageData, 'PNG', 14, 10, 22, 22);
      brandX = 40;
    } catch (err) {
      console.warn('[receipt] Legacy PDF logo embed failed:', err.message);
      brandX = 14;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(TEAL);
  doc.text('MUTALE MUBANGA', brandX, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#FFFFFF');
  doc.text('Growing People.', brandX, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor('#FFFFFF');
  doc.text('RECEIPT', pw - 14, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#CBD5E1');
  doc.text(`NO. ${receiptNo}`, pw - 14, 23, { align: 'right' });

  const orangeW = 28;
  doc.setFillColor(TEAL);
  doc.rect(0, headerH, pw - orangeW, accentH, 'F');
  doc.setFillColor(CORAL);
  doc.rect(pw - orangeW, headerH, orangeW, accentH, 'F');

  let y = headerH + accentH + 12;

  doc.setFillColor(TEAL);
  doc.rect(14, y - 4, 1.2, 14, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(TEAL);
  doc.text('REFERENCE', 18, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  const refLines = doc.splitTextToSize(String(refCode), pw - 36);
  doc.text(refLines, 18, y + 9);

  y += 14 + refLines.length * 4;

  const billBoxW = pw - 28;
  const hasQr = Boolean(qrDataUrl);
  const qrSize = 20;
  const billBoxH = hasQr ? 34 : 28;
  doc.setFillColor(RECEIPT_LIGHT_FILL);
  doc.roundedRect(14, y, billBoxW, billBoxH, 2, 2, 'F');

  const textMaxW = hasQr ? billBoxW / 2 - 12 : billBoxW - 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(TEAL);
  doc.text('BILLED TO', 20, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  const nameLines = doc.splitTextToSize(String(billed.name), textMaxW);
  doc.text(nameLines, 20, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(TEAL);
  const contactParts = [billed.email, billed.phone].filter(Boolean);
  if (contactParts.length) {
    const contactY = y + 14 + nameLines.length * 4 + 2;
    const contactLines = doc.splitTextToSize(contactParts.join('   '), textMaxW);
    doc.text(contactLines, 20, contactY);
  }

  if (hasQr) {
    const xRight = 14 + billBoxW - qrSize - 4;
    const qrY = y + 5;
    try {
      doc.addImage(qrDataUrl, 'PNG', xRight, qrY, qrSize, qrSize);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(TEAL);
      doc.text('Scan for event', xRight + qrSize / 2, qrY + qrSize + 3.5, { align: 'center' });
    } catch {
      /* ignore */
    }
  }

  y += billBoxH + 10;

  const details = buildReceiptDetailRows(registration).map(([label, value]) => {
    if (label === 'Payment Method' || label === 'Registration Type') {
      return [label, titleCase(value)];
    }
    if (label === 'Registration Date' || label === 'Order Date') {
      return [label, formatDate(value)];
    }
    return [label, value];
  });

  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(TEAL);
    doc.text(label, 14, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NAVY);
    const wrapped = doc.splitTextToSize(String(value), pw - 90);
    doc.text(wrapped, pw - 14, y, { align: 'right' });
    y += Math.max(8, wrapped.length * 5);
  });

  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(TEAL);
  doc.text('PAYMENT SUMMARY', 14, y);
  y += 6;

  const tableX = 14;
  const tableW = pw - 28;
  const rowH = 9;
  doc.setFillColor(NAVY);
  doc.rect(tableX, y, tableW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#FFFFFF');
  doc.text('DESCRIPTION', tableX + 4, y + 6);
  doc.text('AMOUNT', tableX + tableW - 4, y + 6, { align: 'right' });
  y += rowH;

  doc.setDrawColor(RECEIPT_BORDER);
  doc.setLineWidth(0.2);
  doc.line(tableX, y, tableX + tableW, y);
  const lineDesc = getReceiptLineItemDescription(registration);
  const lineDescWrapped = doc.splitTextToSize(lineDesc, tableW - 50);
  const lineRowH = Math.max(rowH, lineDescWrapped.length * 5 + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(NAVY);
  doc.text(lineDescWrapped, tableX + 4, y + 6);
  const amountLine = formatCurrency(amountZmw, currency);
  doc.setFont('helvetica', 'bold');
  doc.text(amountLine, tableX + tableW - 4, y + 6, { align: 'right' });
  y += lineRowH;
  doc.line(tableX, y, tableX + tableW, y);

  y += 2;
  doc.setDrawColor(TEAL);
  doc.setLineWidth(0.5);
  doc.line(tableX, y, tableX + tableW, y);
  y += rowH - 2;
  doc.line(tableX, y + rowH, tableX + tableW, y + rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(TEAL);
  doc.text('TOTAL PAID', tableX + 4, y + 6);
  const totalDisplay = formatCurrency(amountZmw, currency).replace(/\.00$/, '');
  doc.text(totalDisplay, tableX + tableW - 4, y + 6, { align: 'right' });
  y += rowH + 10;

  const footerBoxH = 32;
  doc.setFillColor(RECEIPT_LIGHT_BOX);
  doc.roundedRect(14, y, pw - 28, footerBoxH, 2, 2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(NAVY);
  doc.text('Your payment has been received successfully.', pw / 2, y + 11, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.setTextColor(NAVY);
  doc.text('Thank You!', pw / 2, y + 21, { align: 'center' });

  y += footerBoxH + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(TEAL);
  doc.text('www.mutalemubanga.org', pw / 2, y, { align: 'center' });

  const bottomBarH = 4;
  doc.setFillColor(TEAL);
  doc.rect(0, ph - bottomBarH, pw, bottomBarH, 'F');
  doc.setDrawColor(RECEIPT_BORDER);
  doc.setLineWidth(0.3);
  doc.line(14, ph - bottomBarH - 1, pw - 14, ph - bottomBarH - 1);

  return { doc, refCode, receiptNo };
}

export async function generateReceiptPdfBufferLegacy(payload = {}) {
  const { registration, user, logoDataUrl, qrDataUrl } = payload;
  const { doc } = buildReceiptPdfDocLegacy({
    registration,
    user,
    logoDataUrl,
    qrDataUrl,
  });
  return Buffer.from(doc.output('arraybuffer'));
}
