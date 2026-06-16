const RECEIPT_ELIGIBLE_STATUSES = new Set(['paid', 'not_required', 'waived']);

export function isReceiptEligible(paymentStatus = '') {
  return RECEIPT_ELIGIBLE_STATUSES.has(String(paymentStatus || '').trim().toLowerCase());
}

export function formatReceiptDisplayNumber(registration = {}) {
  const src = String(registration.reference_code || registration.payment_reference || registration.id || '0');
  let hash = 0;
  for (let i = 0; i < src.length; i += 1) {
    hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
  }
  return String(hash % 1000000).padStart(6, '0');
}
