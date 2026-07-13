import { jsPDF } from 'jspdf';
import { buildTicketQrDataUrl } from './ticketQr.js';

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

function resolveAttendeeName(registration = {}) {
  return String(registration.booked_for_name || '').trim()
    || String(registration.user_name || '').trim()
    || 'Guest';
}

function resolveEventTitle(event = {}, registration = {}) {
  return String(event.title || registration.event_title || '').trim() || 'Event';
}

function resolveEventLocation(event = {}, registration = {}) {
  return String(event.location || event.venue || registration.event_location || '').trim() || '—';
}

/**
 * @param {object} options
 * @param {object} options.registration
 * @param {object} [options.event]
 * @param {string} [options.appOrigin]
 * @returns {Promise<Blob>}
 */
export async function generateTicketPdfBlob({
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
  if (titleLines.length > 2) {
    doc.setFontSize(9);
    doc.text(`${titleLines.slice(2).join(' ').slice(0, 40)}…`, pw / 2, 27, { align: 'center' });
  }

  const qrDataUrl = await buildTicketQrDataUrl(refCode, appOrigin, { size: 480 });
  const qrSize = 46;
  const qrY = 46;
  if (qrDataUrl) {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect((pw - qrSize) / 2 - 2, qrY - 2, qrSize + 4, qrSize + 4, 2, 2, 'FD');
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
  doc.setTextColor(71, 85, 105);
  doc.text(`Reference: ${refCode}`, pw / 2, y, { align: 'center' });
  y += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  if (eventDate && eventDate !== '—') {
    doc.text(`Date: ${eventDate}${eventTime ? ` · ${eventTime}` : ''}`, 8, y);
    y += 5.5;
  }
  const locLines = doc.splitTextToSize(`Location: ${location}`, pw - 16);
  doc.text(locLines.slice(0, 2), 8, y);
  y += locLines.length > 1 ? 11 : 5.5;

  if (payerName && payerName !== attendeeName) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Purchased by: ${payerName}`, 8, y);
    y += 6;
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(0, ph - 18, pw, 18, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(8, 145, 178);
  doc.text('Show this QR code at the gate for entry', pw / 2, ph - 8, { align: 'center' });

  return doc.output('blob');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} options
 * @param {object} options.registration
 * @param {object} [options.event]
 * @param {string} [options.appOrigin]
 */
export async function downloadTicketPdf(options = {}) {
  const ref = String(options.registration?.reference_code || 'ticket').trim();
  const blob = await generateTicketPdfBlob(options);
  downloadBlob(blob, `ticket-${ref}.pdf`);
}

/**
 * @param {string} referenceCode
 * @param {string} appOrigin
 */
export async function downloadTicketQrPng(referenceCode = '', appOrigin = '') {
  const ref = String(referenceCode || '').trim();
  if (!ref) throw new Error('Ticket reference is required.');
  const dataUrl = await buildTicketQrDataUrl(ref, appOrigin, { size: 512 });
  if (!dataUrl) throw new Error('Could not generate QR code.');
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = `ticket-qr-${ref}.png`;
  anchor.click();
}

export {
  resolveAttendeeName,
  formatTicketDate,
};
