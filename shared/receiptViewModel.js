import { formatReceiptDisplayNumber } from './receiptNumbers.js';
import {
  buildReceiptDetailRows,
  getReceiptLineItemDescription,
  resolveReceiptType,
} from './receiptHelpers.js';
import { buildEventReceiptQrDataUrl } from './receiptQr.js';

function titleCase(str = '') {
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatReceiptDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).split('T')[0]);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDetailValue(label, value) {
  if (label === 'Payment Method' || label === 'Registration Type') {
    return titleCase(value);
  }
  if (label === 'Registration Date' || label === 'Order Date') {
    return formatReceiptDate(value);
  }
  return value;
}

function resolveBilledTo(registration = {}, user = {}) {
  return {
    name: user?.name || registration.user_name || '—',
    email: user?.email || registration.user_email || '',
    phone: user?.phone || registration.user_phone || '',
  };
}

/**
 * @param {{ registration: object, user?: object, appOrigin?: string, logoDataUrl?: string, qrDataUrl?: string }} opts
 */
export async function buildReceiptViewModel({
  registration = {},
  user = {},
  appOrigin = '',
  logoDataUrl = '',
  qrDataUrl: qrDataUrlIn = '',
} = {}) {
  const amount = Number(registration.amount_zmw ?? registration.amount ?? 0);
  const currency = (registration.currency || 'ZMW').toUpperCase();
  const refCode = registration.reference_code || registration.payment_reference || '—';
  const receiptNo = formatReceiptDisplayNumber(registration);
  const billedTo = resolveBilledTo(registration, user);
  const lineItemDesc = getReceiptLineItemDescription(registration);

  let qrDataUrl = qrDataUrlIn;
  if (!qrDataUrl && appOrigin && resolveReceiptType(registration) === 'event') {
    qrDataUrl = await buildEventReceiptQrDataUrl(registration, appOrigin, { size: 160 });
  }

  const detailRows = buildReceiptDetailRows(registration).map(([label, value]) => ({
    label,
    value: formatDetailValue(label, value),
  }));

  const totalDisplay = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
  const lineAmountDisplay = amount.toFixed(2);

  return {
    refCode,
    receiptNo,
    billedTo,
    detailRows,
    lineItemDesc,
    amount,
    currency,
    lineAmountDisplay,
    totalDisplay,
    logoDataUrl,
    qrDataUrl,
  };
}
