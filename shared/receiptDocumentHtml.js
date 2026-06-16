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
 * @returns {string} HTML for [data-receipt-root] element
 */
export function renderReceiptDocumentHtml(viewModel, { outerPadding = true } = {}) {
  const {
    refCode,
    receiptNo,
    billedTo,
    detailRows,
    lineItemDesc,
    currency,
    lineAmountDisplay,
    totalDisplay,
    logoDataUrl,
    qrDataUrl,
  } = viewModel;

  const logoImg = logoDataUrl
    ? `<img src="${escapeAttr(logoDataUrl)}" alt="Mutale Mubanga" width="48" height="48" style="width:48px;height:48px;object-fit:contain;flex-shrink:0;" />`
    : '';

  const qrBlock = qrDataUrl
    ? `<div style="flex-shrink:0;text-align:center;">
        <img src="${escapeAttr(qrDataUrl)}" alt="Event details QR code" width="80" height="80" style="width:80px;height:80px;border-radius:4px;display:block;" />
        <p style="margin:4px 0 0;font-size:9px;color:${teal};">Scan for event</p>
      </div>`
    : '';

  const billedFlex = qrDataUrl ? 'display:flex;justify-content:space-between;align-items:center;gap:16px;' : '';

  const emailLine = billedTo.email
    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${MAIL_SVG}${escapeHtml(billedTo.email)}</span>`
    : '';
  const phoneLine = billedTo.phone
    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${PHONE_SVG}${escapeHtml(billedTo.phone)}</span>`
    : '';

  return `
<div data-receipt-root="true" style="width:${DOC_WIDTH}px;max-width:100%;background-color:${outerPadding ? RECEIPT_LIGHT_FILL : '#ffffff'};padding:${outerPadding ? 32 : 0}px;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
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
        <p style="margin:0;color:#ffffff;font-weight:700;font-size:24px;letter-spacing:0.02em;">RECEIPT</p>
        <p style="margin:2px 0 0;color:rgba(255,255,255,0.7);font-size:12px;font-weight:400;">NO. ${escapeHtml(receiptNo)}</p>
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
          <p style="margin:4px 0 0;font-size:14px;font-weight:400;color:${navy};word-break:break-all;">${escapeHtml(refCode)}</p>
        </div>
      </div>
    </div>
    <div style="padding:20px 24px;">
      <div style="border-radius:12px;padding:16px;background-color:${RECEIPT_LIGHT_BOX};${billedFlex}">
        <div style="min-width:0;flex:1;">
          <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:${teal};">Billed To</p>
          <p style="margin:0;font-size:14px;font-weight:700;color:${navy};">${escapeHtml(billedTo.name)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px;font-size:12px;color:${teal};">
            ${emailLine}
            ${phoneLine}
          </div>
        </div>
        ${qrBlock}
      </div>
    </div>
    <div style="padding:0 24px 16px;">
      ${detailRowsHtml(detailRows)}
    </div>
    <div style="padding:0 24px 20px;">
      <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:${teal};">Payment Summary</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;border:1px solid ${RECEIPT_BORDER};border-collapse:collapse;overflow:hidden;">
        <tr style="background-color:${navy};color:#ffffff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">
          <td style="padding:8px 12px;">Description</td>
          <td style="padding:8px 12px;text-align:right;">Amount</td>
        </tr>
        <tr style="font-size:12px;border-bottom:1px solid ${RECEIPT_BORDER};">
          <td style="padding:12px;color:${navy};vertical-align:top;">${escapeHtml(lineItemDesc)}</td>
          <td style="padding:12px;color:${navy};text-align:right;font-weight:600;vertical-align:top;">${escapeHtml(currency)} ${escapeHtml(lineAmountDisplay)}</td>
        </tr>
        <tr style="font-size:14px;font-weight:700;color:${teal};border-top:2px solid ${teal};">
          <td style="padding:12px;">TOTAL PAID</td>
          <td style="padding:12px;text-align:right;">${escapeHtml(currency)} ${escapeHtml(totalDisplay)}</td>
        </tr>
      </table>
    </div>
    <div style="margin:0 24px 24px;border-radius:12px;padding:20px;text-align:center;background-color:${RECEIPT_LIGHT_BOX};">
      <p style="margin:0;font-size:14px;color:${navy};">Your payment has been received successfully.</p>
      <p style="margin:8px 0 0;font-size:18px;font-style:italic;font-family:Georgia,'Times New Roman',serif;color:${navy};">Thank You!</p>
    </div>
    <p style="margin:0;text-align:center;font-size:14px;font-weight:500;padding-bottom:16px;color:${teal};">www.mutalemubanga.org</p>
    <div style="height:4px;background-color:${teal};"></div>
  </div>
</div>`;
}
