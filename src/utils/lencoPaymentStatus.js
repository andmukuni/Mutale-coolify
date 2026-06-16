export function isLencoSuccessStatus(rawStatus = '') {
  const status = String(rawStatus || '').toLowerCase();
  return ['successful', 'success', 'paid', 'completed'].includes(status);
}

export function isLencoFailedStatus(rawStatus = '') {
  const status = String(rawStatus || '').toLowerCase();
  return ['failed', 'cancelled', 'declined', 'reversed'].includes(status);
}

export function extractLencoPaymentStatus(payload = {}) {
  const candidates = [
    payload?.data?.data?.status,
    payload?.data?.paymentStatus,
    payload?.data?.transaction?.status,
    payload?.data?.status,
    payload?.status,
  ];
  const textStatus = candidates.find((value) => typeof value === 'string' && value.trim());
  return String(textStatus || '').toLowerCase();
}
