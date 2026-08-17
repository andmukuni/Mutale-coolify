import {
  RECEIPT_PALETTE,
  RECEIPT_LIGHT_BOX,
  RECEIPT_LIGHT_FILL,
  RECEIPT_BORDER,
} from './receiptTheme.js';

const { navy, teal, coral } = RECEIPT_PALETTE;
/** Portrait card width — matches mobile A4 ticket proportions. */
const DOC_WIDTH = 420;

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str = '') {
  return String(str).replace(/"/g, '&quot;');
}

function pickRow(detailRows, label) {
  return detailRows.find((row) => row.label === label)?.value?.trim() || '';
}

/**
 * Compact meta rows shown under the QR (skip fields already shown above).
 */
function compactMetaRows(detailRows = []) {
  const skip = new Set(['Event', 'Date', 'Time', 'Venue', 'Ticket holder']);
  return detailRows.filter((row) => !skip.has(row.label));
}

function buildEventMeta(detailRows = []) {
  return [pickRow(detailRows, 'Date'), pickRow(detailRows, 'Time'), pickRow(detailRows, 'Venue')]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Branded portrait TICKET — shared by web preview, email PDF, and print.
 * Layout matches mobile TicketDocumentCard (orientation=portrait).
 *
 * @param {object} viewModel
 * @param {{ outerPadding?: boolean }} [opts]
 * @returns {string}
 */
export function renderTicketDocumentHtml(viewModel, { outerPadding = true } = {}) {
  const {
    refCode,
    ticketNo,
    attendee = {},
    detailRows = [],
    logoDataUrl,
    qrDataUrl,
    eventTitle: eventTitleIn,
  } = viewModel;

  const eventTitle = String(eventTitleIn || pickRow(detailRows, 'Event') || 'Event').trim();
  const eventMeta = buildEventMeta(detailRows);
  const holderLine = [attendee.name || 'Guest', attendee.email, attendee.phone]
    .filter(Boolean)
    .join(' · ');
  const extraRows = compactMetaRows(detailRows);

  const logoImg = logoDataUrl
    ? `<img src="${escapeAttr(logoDataUrl)}" alt="Mutale Mubanga" width="40" height="40" style="width:40px;height:40px;object-fit:contain;display:block;flex-shrink:0;" />`
    : '';

  const qrBlock = qrDataUrl
    ? `<div style="padding:8px;border-radius:8px;border:1px solid ${RECEIPT_BORDER};background-color:#ffffff;display:inline-block;">
        <img src="${escapeAttr(qrDataUrl)}" alt="Gate entry QR code" width="148" height="148" style="width:148px;height:148px;display:block;" />
      </div>`
    : '';

  const extraRowsHtml = extraRows
    .map(
      ({ label, value }) => `
        <div style="margin-bottom:8px;text-align:center;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:${teal};">${escapeHtml(label)}</div>
          <div style="font-size:13px;font-weight:600;color:${navy};line-height:17px;">${escapeHtml(value || '—')}</div>
        </div>`,
    )
    .join('');

  return `
<div data-ticket-root="true" style="width:${DOC_WIDTH}px;max-width:100%;margin:0 auto;background-color:${outerPadding ? RECEIPT_LIGHT_FILL : 'transparent'};padding:${outerPadding ? 24 : 0}px;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${RECEIPT_BORDER};${outerPadding ? 'box-shadow:0 1px 3px rgba(0,0,0,0.06);' : ''}">
    <div style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background-color:${navy};">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
        ${logoImg}
        <div style="min-width:0;">
          <p style="margin:0;font-weight:700;font-size:12px;line-height:15px;color:${teal};">MUTALE MUBANGA</p>
          <p style="margin:2px 0 0;font-size:10px;color:#ffffff;">Growing People.</p>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;max-width:46%;">
        <p style="margin:0;color:#ffffff;font-weight:700;font-size:14px;letter-spacing:0.02em;">TICKET</p>
        <p style="margin:2px 0 0;color:rgba(255,255,255,0.72);font-size:9px;font-family:ui-monospace,monospace;word-break:break-all;">${escapeHtml(ticketNo || refCode)}</p>
      </div>
    </div>
    <div style="display:flex;height:3px;">
      <div style="flex:1;background-color:${teal};"></div>
      <div style="width:48px;background-color:${coral};"></div>
    </div>
    <div style="padding:20px 20px 12px;text-align:center;">
      <p style="margin:0;font-size:17px;font-weight:700;line-height:22px;color:${navy};">${escapeHtml(eventTitle)}</p>
      ${eventMeta ? `<p style="margin:6px 0 0;font-size:12px;line-height:16px;color:${teal};">${escapeHtml(eventMeta)}</p>` : ''}
      <div style="margin-top:12px;border-radius:8px;padding:10px 12px;background-color:${RECEIPT_LIGHT_BOX};">
        <p style="margin:0;font-size:12px;font-weight:600;line-height:16px;color:${navy};">${escapeHtml(holderLine)}</p>
      </div>
      <div style="margin-top:16px;">
        ${qrBlock}
      </div>
      <div style="margin-top:14px;">${extraRowsHtml}</div>
      <p style="margin:12px 0 0;font-size:12px;line-height:16px;color:${navy};opacity:0.85;">Present this QR code at the event gate for entry.</p>
    </div>
    <div>
      <p style="margin:0 0 14px;text-align:center;font-size:12px;font-weight:600;color:${teal};">www.mutalemubanga.org</p>
      <div style="height:3px;background-color:${teal};"></div>
    </div>
  </div>
</div>`;
}
