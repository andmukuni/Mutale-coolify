const TICKET_REF_PATTERN = /^MM-\d{8}-\d{4}$/;

function dateStampInZone(now = new Date(), timeZone = 'Africa/Lusaka') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function randomFourDigits() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(buf[0] % 10000).padStart(4, '0');
  }
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export function isTicketReference(value) {
  return TICKET_REF_PATTERN.test(String(value || '').trim());
}

/**
 * Short ticket reference: MM-YYYYMMDD-XXXX
 * Date is the issue day in the event timezone (Africa/Lusaka by default).
 * XXXX is four random digits.
 */
export function generateTicketReference(now = new Date(), options = {}) {
  const dateStamp = dateStampInZone(now, options.timeZone);
  const suffix = String(options.randomDigits ?? randomFourDigits()).replace(/\D/g, '').padStart(4, '0').slice(-4);
  return `MM-${dateStamp}-${suffix}`;
}
