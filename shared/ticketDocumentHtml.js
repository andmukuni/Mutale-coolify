import {
  RECEIPT_PALETTE,
  RECEIPT_LIGHT_BOX,
  RECEIPT_LIGHT_FILL,
  RECEIPT_BORDER,
} from './receiptTheme.js';

const { navy, teal, coral } = RECEIPT_PALETTE;
const DOC_WIDTH = 672;

const MAIL_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6l8 6 8-6M4 6v12h16V6"/></svg>';
const PHONE_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6.6 3h2.2l1.4 3.5-2 1.2a11 11 0 005.5 5.5l1.2-2 3.5 1.4v2.2A2 2 0 0117.7 19C10.2 19 5 13.8 5 6.3 5 4.9 5.7 3.7 6.6 3z"/></svg>';

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

function detailRowsHtml(detailRows) {
  return detailRows.map(({ label, value }) => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:6px 0;font-size:12px;">
      <span style="color:${teal};flex-shrink:0;">${escapeHtml(label)}</span>
      <span style="color:${navy};font-weight:600;text-align:right;word-break:break-word;">${escapeHtml(value || '—')}</span>
    </div>
  `).join('');
}

/**
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
    ticketUrl,
  } = viewModel;

  const logoImg = logoDataUrl
    ? `<img src="${escapeAttr(logoDataUrl)}" alt="Mutale Mubanga" width="48" height="48" style="width:48px;height:48px;object-fit:contain;flex-shrink:0;" />`
    : '';

  const qrBlock = qrDataUrl
    ? `<div style="text-align:center;margin:0 auto;">
        <img src="${escapeAttr(qrDataUrl)}" alt="Gate entry QR code" width="140" height="140" style="width:140px;height:140px;border-radius:8px;display:block;margin:0 auto;border:1px solid ${RECEIPT_BORDER};" />
        <p style="margin:8px 0 0;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${teal};">Scan at gate for entry</p>
      </div>`
    : '';

  const emailLine = attendee.email
    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${MAIL_SVG}${escapeHtml(attendee.email)}</span>`
    : '';
  const phoneLine = attendee.phone
    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${PHONE_SVG}${escapeHtml(attendee.phone)}</span>`
    : '';

  const ticketLinkBlock = ticketUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:${navy};">View ticket online: <a href="${escapeAttr(ticketUrl)}" style="color:${teal};font-weight:600;">${escapeHtml(ticketUrl)}</a></p>`
    : '';

  return `
<div data-ticket-root="true" style="width:${DOC_WIDTH}px;max-width:100%;background-color:${outerPadding ? RECEIPT_LIGHT_FILL : '#ffffff'};padding:${outerPadding ? 32 : 0}px;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${RECEIPT_BORDER};${outerPadding ? 'box-shadow:0 1px 3px rgba(0,0,0,0.06);' : ''}">
    <div style="padding:20px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;background-color:${navy};">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        ${logoImg}
        <div>
          <p style="margin:0;font-weight:700;font-size:14px;line-height:1.25;color:${teal};">MUTALE MUBANGA</p>
          <p style="margin:2px 0 0;font-size:11px;color:#ffffff;">Growing People.</p>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <p style="margin:0;color:#ffffff;font-weight:700;font-size:22px;letter-spacing:0.02em;">ENTRY TICKET</p>
        <p style="margin:2px 0 0;color:rgba(255,255,255,0.7);font-size:11px;font-weight:400;">NO. ${escapeHtml(ticketNo || refCode)}</p>
      </div>
    </div>
    <div style="display:flex;height:4px;">
      <div style="flex:1;background-color:${teal};"></div>
      <div style="width:64px;background-color:${coral};"></div>
    </div>
    <div style="padding:20px 24px;border-bottom:1px solid ${RECEIPT_BORDER};">
      <div style="display:flex;gap:8px;">
        <span style="width:2px;border-radius:999px;background-color:${teal};flex-shrink:0;" aria-hidden="true"></span>
        <div>
          <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:${teal};">Reference</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:400;color:${navy};word-break:break-all;font-family:ui-monospace,monospace;">${escapeHtml(refCode)}</p>
        </div>
      </div>
    </div>
    <div style="padding:20px 24px;">
      <div style="border-radius:12px;padding:16px;background-color:${RECEIPT_LIGHT_BOX};">
        <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:${teal};">Ticket holder</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:${navy};">${escapeHtml(attendee.name || 'Guest')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px;font-size:12px;color:${teal};">
          ${emailLine}
          ${phoneLine}
        </div>
      </div>
    </div>
    <div style="padding:0 24px 16px;">
      ${detailRowsHtml(detailRows)}
    </div>
    <div style="padding:0 24px 20px;">
      ${qrBlock}
      ${ticketLinkBlock}
    </div>
    <div style="margin:0 24px 24px;border-radius:12px;padding:20px;text-align:center;background-color:${RECEIPT_LIGHT_BOX};">
      <p style="margin:0;font-size:14px;color:${navy};">Present this ticket at the event gate for entry.</p>
      <p style="margin:8px 0 0;font-size:18px;font-style:italic;font-family:Georgia,'Times New Roman',serif;color:${navy};">See you there!</p>
    </div>
    <p style="margin:0;text-align:center;font-size:14px;font-weight:500;padding-bottom:16px;color:${teal};">www.mutalemubanga.org</p>
    <div style="height:4px;background-color:${teal};"></div>
  </div>
</div>`;
}
