/**
 * Normalizes event registrations and shop orders into a shared receipt shape.
 */

export function resolveReceiptType(record = {}) {
  const explicit = String(record.receipt_type || '').toLowerCase();
  if (explicit === 'event' || explicit === 'product' || explicit === 'cv') return explicit;
  if (record.event_id || (record.event_title && !record.items)) return 'event';
  if (Array.isArray(record.items) && record.items.length > 0) return 'product';
  return record.event_title ? 'event' : 'product';
}

export function getReceiptSubjectTitle(record = {}) {
  const type = resolveReceiptType(record);
  const fallback = type === 'cv' ? 'CV Generator' : type === 'product' ? 'Product' : 'Event';
  return String(
    record.line_item_title
    || record.event_title
    || record.product_title
    || fallback,
  ).trim() || '—';
}

export function getReceiptLineItemDescription(record = {}) {
  const type = resolveReceiptType(record);
  const title = getReceiptSubjectTitle(record);
  if (type === 'cv') return `CV Generator – ${title}`;
  if (type === 'product') return `Product Purchase – ${title}`;
  return `Event Registration – ${title}`;
}

export function buildReceiptDetailRows(record = {}) {
  const type = resolveReceiptType(record);
  const title = getReceiptSubjectTitle(record);
  const dateValue = record.registered_at || record.created_at || record.ordered_at;

  if (type === 'product') {
    return [
      ['Product', title],
      ['Order Date', dateValue],
      ['Payment Method', record.payment_method || '—'],
    ];
  }

  if (type === 'cv') {
    return [
      ['Service', title],
      ['Purchase Date', dateValue],
      ['Payment Method', record.payment_method || '—'],
    ];
  }

  return [
    ['Event', title],
    ['Registration Date', dateValue],
    ['Registration Type', record.registration_type || 'Subscription'],
    ['Payment Method', record.payment_method || '—'],
  ];
}

export function mapRegistrationToReceiptRecord(registration = {}) {
  return {
    ...registration,
    receipt_type: 'event',
    line_item_title: registration.event_title || registration.line_item_title || 'Event',
  };
}

export function summarizeOrderItems(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return 'Shop order';
  if (list.length === 1) {
    return String(list[0].title || list[0].name || 'Product').trim() || 'Product';
  }
  const first = String(list[0].title || list[0].name || 'Item').trim() || 'Item';
  return `${first} (+${list.length - 1} more)`;
}

export function mapBookOrderToReceiptRecord(order = {}) {
  const items = Array.isArray(order.items)
    ? order.items
    : (() => {
      try {
        return typeof order.items === 'string' ? JSON.parse(order.items) : [];
      } catch {
        return [];
      }
    })();

  return {
    id: order.id,
    receipt_type: 'product',
    reference_code: order.payment_reference || order.id,
    payment_reference: order.payment_reference,
    user_name: order.user_name,
    user_email: order.user_email,
    user_phone: order.user_phone,
    line_item_title: summarizeOrderItems(items),
    registered_at: order.created_at,
    created_at: order.created_at,
    registration_type: 'purchase',
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    amount_zmw: order.total,
    amount: order.total,
    currency: order.currency || 'ZMW',
    items,
  };
}

export function mapCvPaymentToReceiptRecord(collection = {}, user = {}) {
  const amount = Number(collection.amount || 0);
  const channel = String(collection.channel || '').trim();
  const paymentMethod = channel === 'mobile_money' ? 'mobile_money'
    : channel === 'card' ? 'card'
    : channel || 'online';

  return {
    id: collection.reference || collection.id,
    receipt_type: 'cv',
    reference_code: collection.reference,
    payment_reference: collection.reference,
    user_name: collection.customer_name || user.name,
    user_email: collection.customer_email || user.email,
    user_phone: collection.customer_phone || user.phone,
    line_item_title: collection.event_title || 'CV Generator (PDF + Word)',
    registered_at: collection.created_at,
    created_at: collection.created_at,
    registration_type: 'purchase',
    payment_method: paymentMethod,
    payment_status: 'paid',
    amount_zmw: amount,
    amount,
    currency: collection.currency || 'ZMW',
    receipt_email_sent_at: collection.receipt_email_sent_at,
  };
}

export function mergeReceiptRecords(registrations = [], orders = [], cvPayments = []) {
  const eventRows = registrations
    .map(mapRegistrationToReceiptRecord)
    .map((r) => ({ ...r, receipt_source: 'registration', receipt_source_id: r.id }));
  const productRows = orders
    .map(mapBookOrderToReceiptRecord)
    .map((r) => ({ ...r, receipt_source: 'order', receipt_source_id: r.id }));
  const cvRows = cvPayments
    .map((row) => mapCvPaymentToReceiptRecord(row.collection || row, row.user || {}))
    .map((r) => ({ ...r, receipt_source: 'cv', receipt_source_id: r.reference_code || r.id }));

  return [...eventRows, ...productRows, ...cvRows].sort((a, b) => {
    const ta = new Date(a.registered_at || a.created_at || 0).getTime();
    const tb = new Date(b.registered_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}
