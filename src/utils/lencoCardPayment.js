/**
 * Lenco Pay inline card widget helpers (see Lenco Accept Payments docs).
 */

export function normalizePhoneForLenco(raw = '') {
  const trimmed = String(raw || '').replace(/\s+/g, '').trim();
  if (!trimmed) return '';

  let digits = trimmed;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = `260${digits.slice(1)}`;
  return digits;
}

export function splitCustomerName(name = '', email = '') {
  const trimmed = String(name || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || 'Customer',
      lastName: parts.slice(1).join(' ') || parts[0] || 'Customer',
    };
  }
  const local = String(email || '').split('@')[0] || 'Customer';
  return { firstName: local, lastName: 'Customer' };
}

export function phoneForLencoWidget(phone = '') {
  const digits = normalizePhoneForLenco(phone);
  if (digits.startsWith('260') && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  return String(phone || '').replace(/\s+/g, '').trim();
}

export function buildLencoWidgetCustomer(customer = {}) {
  const { firstName, lastName } = splitCustomerName(customer.name, customer.email);
  const widgetCustomer = { firstName, lastName };
  const phone = phoneForLencoWidget(customer.phone);
  if (phone) widgetCustomer.phone = phone;
  return widgetCustomer;
}

export function buildLencoGetPaidPayload(session) {
  return {
    key: session.publicKey,
    email: session.customer?.email,
    amount: session.amount,
    currency: session.currency,
    reference: session.reference,
    channels: ['card'],
    label: session.label || 'Event registration',
    customer: buildLencoWidgetCustomer(session.customer || {}),
  };
}

export async function loadPaymentScript(src) {
  if (!src) throw new Error('Missing payment widget URL.');
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load payment widget.'));
    document.body.appendChild(script);
  });
}

export async function runLencoCardWidget(session, { loadScript = loadPaymentScript } = {}) {
  await loadScript(session.widgetUrl);

  const lenco = window.LencoPay;
  if (!lenco || typeof lenco.getPaid !== 'function') {
    throw new Error('Lenco card widget is not available.');
  }

  const resolveReference = (response) => (
    response?.reference || response?.transactionReference || session.reference
  );

  const basePayload = buildLencoGetPaidPayload(session);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (reference) => {
      if (settled) return;
      settled = true;
      resolve(reference);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    lenco.getPaid({
      ...basePayload,
      onSuccess: (response) => finish(resolveReference(response)),
      onConfirmationPending: () => finish(session.reference),
      onClose: () => {
        fail(new Error(
          'Card checkout was not completed. If you saw an authorization error, confirm card payments are enabled with Lenco support and try again.',
        ));
      },
    });
  });
}
