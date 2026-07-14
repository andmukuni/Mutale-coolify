import { jsPDF } from 'jspdf';
import { buildTicketQrDataUrl } from './ticketQr.js';
import {
  resolveAttendeeName,
  resolveEventTitle,
  resolveEventLocation,
} from './ticketViewModel.js';

function formatTicketDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTicketTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  return raw;
}

/** @deprecated Legacy jsPDF ticket layout — use generateTicketPdfBuffer from ticketPdf.js */
export async function generateTicketPdfBlobLegacy({
  registration = {},
  event = {},
  appOrigin = '',
} = {}) {
  const doc = new jsPDF({ unit: 'mm', format: [100, 175] });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  const attendeeName = resolveAttendeeName(registration);
  const payerName = String(registration.user_name || '').trim();
  const refCode = String(registration.reference_code || '—').trim();
  const eventTitle = resolveEventTitle(event, registration);
  const eventDate = formatTicketDate(event.start_date || event.date || registration.event_date);
  const eventTime = formatTicketTime(event.start_time || event.time);
  const location = resolveEventLocation(event, registration);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 38, 'F');
  doc.setFillColor(8, 145, 178);
  doc.rect(0, 38, pw, 1.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('EVENT TICKET', pw / 2, 11, { align: 'center' });
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(eventTitle, pw - 14);
  doc.text(titleLines.slice(0, 2), pw / 2, 20, { align: 'center' });

  const qrDataUrl = await buildTicketQrDataUrl(refCode, appOrigin, { size: 480 });
  const qrSize = 46;
  const qrY = 46;
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', (pw - qrSize) / 2, qrY, qrSize, qrSize);
  }

  let y = qrY + qrSize + 12;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(attendeeName, pw / 2, y, { align: 'center' });
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Reference: ${refCode}`, pw / 2, y, { align: 'center' });

  if (payerName && payerName !== attendeeName) {
    y += 8;
    doc.text(`Purchased by: ${payerName}`, 8, y);
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(0, ph - 18, pw, 18, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(8, 145, 178);
  doc.text('Show this QR code at the gate for entry', pw / 2, ph - 8, { align: 'center' });

  if (eventDate && eventDate !== '—') {
    doc.setFontSize(8);
    doc.text(`Date: ${eventDate}${eventTime ? ` · ${eventTime}` : ''}`, 8, qrY + qrSize + 20);
  }
  doc.text(`Location: ${location}`.slice(0, 60), 8, qrY + qrSize + 26);

  return doc.output('blob');
}
