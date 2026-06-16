import {
  generateReceiptPdfBuffer,
  isReceiptEligible,
} from '../shared/receiptPdf.js';
import {
  getReceiptSubjectTitle,
  mapBookOrderToReceiptRecord,
  mapCvPaymentToReceiptRecord,
  mapRegistrationToReceiptRecord,
  resolveReceiptType,
} from '../shared/receiptHelpers.js';
import { loadReceiptLogoDataUrl } from '../shared/receiptLogoAsset.js';

export { isReceiptEligible, formatReceiptDisplayNumber } from '../shared/receiptPdf.js';
export { loadReceiptLogoDataUrl };

export const CV_PRODUCT_EVENT_ID = '__cv_generator__';
export const SHOP_ORDER_EVENT_ID = '__shop_order__';

export function buildReceiptFilename(registration = {}) {
  const ref = String(registration.reference_code || registration.payment_reference || 'receipt')
    .replace(/[^a-zA-Z0-9-_]/g, '-');
  return `Receipt-${ref}.pdf`;
}

function parseOrderItems(row = {}) {
  try {
    return typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
  } catch {
    return [];
  }
}

function parseOrderShipping(row = {}) {
  try {
    return typeof row.shipping_address === 'string'
      ? JSON.parse(row.shipping_address)
      : (row.shipping_address || {});
  } catch {
    return row.shipping_address || {};
  }
}

export function mapToReceiptRecord(source, row, { mapDbRegistration, user } = {}) {
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized === 'registration') {
    const reg = typeof mapDbRegistration === 'function' ? mapDbRegistration(row) : row;
    return mapRegistrationToReceiptRecord(reg);
  }
  if (normalized === 'order') {
    const parsed = {
      ...row,
      items: parseOrderItems(row),
      shipping_address: parseOrderShipping(row),
    };
    return mapBookOrderToReceiptRecord(parsed);
  }
  if (normalized === 'cv') {
    return mapCvPaymentToReceiptRecord(row, user || {});
  }
  return row;
}

function buildReceiptEmailCopy(registration = {}, event = {}) {
  const type = resolveReceiptType(registration);
  const title = getReceiptSubjectTitle({
    ...registration,
    event_title: registration.event_title || event.title,
  });
  const refCode = registration.reference_code || registration.payment_reference || '';

  if (type === 'cv') {
    return {
      subject: `Receipt: ${title}`,
      previewText: 'Your CV generator purchase receipt is attached.',
      thankYouLine: `Thank you for purchasing "${title}".`,
    };
  }
  if (type === 'product') {
    return {
      subject: `Receipt: ${title}`,
      previewText: 'Your purchase receipt is attached.',
      thankYouLine: `Thank you for your purchase of "${title}".`,
    };
  }
  return {
    subject: `Receipt: ${title}`,
    previewText: 'Your registration receipt is attached.',
    thankYouLine: `Thank you for registering for "${title}".`,
  };
}

/**
 * @param {{ receiptSource: string, receiptSourceId: string, pool: object }} opts
 */
export async function isReceiptEmailAlreadySent({ receiptSource, receiptSourceId, pool }) {
  const source = String(receiptSource || '').trim().toLowerCase();
  const id = String(receiptSourceId || '').trim();
  if (!id) return false;

  if (source === 'registration') {
    const [rows] = await pool.query(
      'SELECT receipt_email_sent_at FROM event_registrations WHERE id = ? LIMIT 1',
      [id],
    );
    return Boolean(rows[0]?.receipt_email_sent_at);
  }
  if (source === 'order') {
    const [rows] = await pool.query(
      'SELECT receipt_email_sent_at FROM book_orders WHERE id = ? LIMIT 1',
      [id],
    );
    return Boolean(rows[0]?.receipt_email_sent_at);
  }
  if (source === 'cv' || source === 'payment') {
    const [rows] = await pool.query(
      'SELECT receipt_email_sent_at FROM payment_collections WHERE reference = ? LIMIT 1',
      [id],
    );
    return Boolean(rows[0]?.receipt_email_sent_at);
  }
  return false;
}

/**
 * @param {{ receiptSource: string, receiptSourceId: string, pool: object }} opts
 */
export async function markReceiptEmailSent({ receiptSource, receiptSourceId, pool }) {
  const source = String(receiptSource || '').trim().toLowerCase();
  const id = String(receiptSourceId || '').trim();
  if (!id) return;

  const now = new Date();
  if (source === 'registration') {
    await pool.query(
      'UPDATE event_registrations SET receipt_email_sent_at = ? WHERE id = ?',
      [now, id],
    );
    return;
  }
  if (source === 'order') {
    await pool.query(
      'UPDATE book_orders SET receipt_email_sent_at = ? WHERE id = ?',
      [now, id],
    );
    return;
  }
  if (source === 'cv' || source === 'payment') {
    await pool.query(
      'UPDATE payment_collections SET receipt_email_sent_at = ? WHERE reference = ?',
      [now, id],
    );
  }
}

function resolveReceiptSourceMeta(registration = {}) {
  if (registration.receipt_source && registration.receipt_source_id) {
    return {
      receiptSource: registration.receipt_source,
      receiptSourceId: registration.receipt_source_id,
    };
  }
  const type = resolveReceiptType(registration);
  if (type === 'cv') {
    return {
      receiptSource: 'cv',
      receiptSourceId: registration.reference_code || registration.payment_reference || registration.id,
    };
  }
  if (type === 'product' || (Array.isArray(registration.items) && registration.items.length > 0)) {
    return { receiptSource: 'order', receiptSourceId: registration.id };
  }
  return { receiptSource: 'registration', receiptSourceId: registration.id };
}

/**
 * Load a receipt record by source/id for download.
 */
export async function resolveReceiptRecordForDownload({
  pool,
  source,
  id,
  mapDbRegistration,
  cvProductEventId = CV_PRODUCT_EVENT_ID,
}) {
  const normalizedSource = String(source || '').trim().toLowerCase();
  const recordId = String(id || '').trim();
  if (!recordId) {
    return { ok: false, status: 400, message: 'Receipt id is required.' };
  }
  const allowed = new Set(['registration', 'order', 'cv']);
  if (!allowed.has(normalizedSource)) {
    return { ok: false, status: 400, message: 'Invalid receipt source.' };
  }

  if (normalizedSource === 'registration') {
    const [[row]] = await pool.query('SELECT * FROM event_registrations WHERE id = ?', [recordId]);
    if (!row) {
      return { ok: false, status: 404, message: 'Registration not found.' };
    }
    const registration = mapDbRegistration(row);
    return {
      ok: true,
      source: 'registration',
      registration: mapRegistrationToReceiptRecord(registration),
      ownerUserId: String(row.user_id || ''),
      ownerEmail: String(row.user_email || '').toLowerCase(),
    };
  }

  if (normalizedSource === 'order') {
    const [[row]] = await pool.query('SELECT * FROM book_orders WHERE id = ?', [recordId]);
    if (!row) {
      return { ok: false, status: 404, message: 'Order not found.' };
    }
    const parsed = {
      ...row,
      items: parseOrderItems(row),
      shipping_address: parseOrderShipping(row),
    };
    const registration = mapBookOrderToReceiptRecord(parsed);
    return {
      ok: true,
      source: 'order',
      registration,
      ownerUserId: String(row.user_id || ''),
      ownerEmail: String(row.user_email || '').toLowerCase(),
    };
  }

  const [[collection]] = await pool.query(
    'SELECT * FROM payment_collections WHERE reference = ? AND event_id = ? LIMIT 1',
    [recordId, cvProductEventId],
  );
  if (!collection) {
    return { ok: false, status: 404, message: 'Payment not found.' };
  }
  const registration = mapCvPaymentToReceiptRecord(collection);
  return {
    ok: true,
    source: 'cv',
    registration,
    ownerUserId: '',
    ownerEmail: String(collection.customer_email || '').toLowerCase(),
  };
}

/**
 * Verify JWT user may download this receipt.
 */
export function assertReceiptDownloadAllowedForUser({ jwtAuth, ownerUserId, ownerEmail = '' }) {
  const requestUserId = String(jwtAuth?.claims?.sub || '');
  const requestEmail = String(jwtAuth?.claims?.email || '').trim().toLowerCase();
  const normalizedOwnerEmail = String(ownerEmail || '').trim().toLowerCase();

  if (ownerUserId && requestUserId && requestUserId === String(ownerUserId)) {
    return { ok: true };
  }
  if (normalizedOwnerEmail && requestEmail && requestEmail === normalizedOwnerEmail) {
    return { ok: true };
  }
  if (!ownerUserId && normalizedOwnerEmail && requestEmail === normalizedOwnerEmail) {
    return { ok: true };
  }
  if (requestUserId && ownerUserId && requestUserId !== String(ownerUserId)) {
    return { ok: false, status: 403, message: 'You can only download your own receipts.' };
  }
  if (normalizedOwnerEmail && requestEmail && requestEmail !== normalizedOwnerEmail) {
    return { ok: false, status: 403, message: 'You can only download your own receipts.' };
  }
  return { ok: false, status: 403, message: 'You can only download your own receipts.' };
}

export async function generateRegistrationReceiptBuffer({
  registration,
  user = {},
  appRoot,
  appOrigin = '',
}) {
  const logoDataUrl = await loadReceiptLogoDataUrl(appRoot);
  return generateReceiptPdfBuffer({ registration, user, logoDataUrl, appOrigin });
}

/**
 * Send receipt PDF email (best-effort).
 */
export async function sendReceiptEmail({
  registration,
  event = {},
  settings,
  sendEmailNotification,
  buildBrandedEmailHtml,
  appRoot,
  appOrigin = '',
  pool = null,
  skipIdempotencyCheck = false,
}) {
  const to = String(registration.user_email || '').trim();
  if (!to) {
    return { status: 'skipped', reason: 'No recipient email.' };
  }
  if (!isReceiptEligible(registration.payment_status)) {
    return { status: 'skipped', reason: 'Payment status not eligible for receipt.' };
  }

  if (registration.receipt_email_sent_at) {
    return { status: 'skipped', reason: 'Receipt email already sent.' };
  }

  const { receiptSource, receiptSourceId } = resolveReceiptSourceMeta(registration);
  if (pool && !skipIdempotencyCheck) {
    const alreadySent = await isReceiptEmailAlreadySent({ receiptSource, receiptSourceId, pool });
    if (alreadySent) {
      return { status: 'skipped', reason: 'Receipt email already sent.' };
    }
  }

  const copy = buildReceiptEmailCopy(registration, event);
  const refCode = registration.reference_code || registration.payment_reference || '';
  const user = {
    name: registration.user_name,
    email: registration.user_email,
    phone: registration.user_phone,
  };

  let pdfBuffer;
  try {
    pdfBuffer = await generateRegistrationReceiptBuffer({
      registration,
      user,
      appRoot,
      appOrigin,
    });
  } catch (err) {
    console.error('[receipt] PDF generation failed:', err.message);
    return { status: 'failed', reason: err.message };
  }

  const filename = buildReceiptFilename(registration);
  const text = [
    `Hi ${user.name || 'there'},`,
    '',
    copy.thankYouLine,
    'Your payment receipt is attached to this email.',
    refCode ? `Reference: ${refCode}` : '',
    '',
    'Best regards,',
    'Mutale Mubanga',
  ].filter(Boolean).join('\n');

  const html = buildBrandedEmailHtml({
    title: copy.subject,
    previewText: copy.previewText,
    greeting: `Hi ${user.name || 'there'},`,
    bodyLines: [
      copy.thankYouLine,
      'Your payment receipt is attached to this email.',
      refCode ? `Reference: ${refCode}` : '',
    ].filter(Boolean),
    footerLines: ['Best regards,', 'Mutale Mubanga'],
  });

  const result = await sendEmailNotification({
    settings,
    to,
    subject: copy.subject,
    text,
    html,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });

  if (result?.status === 'sent') {
    if (pool) {
      await markReceiptEmailSent({ receiptSource, receiptSourceId, pool });
    }
    console.log(`[receipt] ✓ Receipt email sent to ${to} — "${copy.subject}"`);
  } else {
    console.warn(`[receipt] Receipt email not sent: ${result?.reason || result?.status}`);
  }

  return result;
}

/** @deprecated Use sendReceiptEmail */
export const sendRegistrationReceiptEmail = sendReceiptEmail;

export async function maybeSendReceiptOnSettlement({
  previousRegistration,
  currentRegistration,
  event = {},
  settings,
  sendEmailNotification,
  buildBrandedEmailHtml,
  appRoot,
  appOrigin = '',
  pool = null,
}) {
  if (isReceiptEligible(previousRegistration?.payment_status)) {
    return { status: 'skipped', reason: 'Receipt already applicable on previous status.' };
  }
  if (!isReceiptEligible(currentRegistration?.payment_status)) {
    return { status: 'skipped', reason: 'Current status not eligible.' };
  }
  return sendReceiptEmail({
    registration: currentRegistration,
    event,
    settings,
    sendEmailNotification,
    buildBrandedEmailHtml,
    appRoot,
    appOrigin,
    pool,
  });
}

/** @deprecated Use maybeSendReceiptOnSettlement */
export const maybeSendRegistrationReceiptOnSettlement = maybeSendReceiptOnSettlement;

export async function buildReceiptAttachmentIfEligible({ registration, appRoot, appOrigin = '' }) {
  if (!isReceiptEligible(registration.payment_status)) return [];
  try {
    const pdfBuffer = await generateRegistrationReceiptBuffer({
      registration,
      user: {
        name: registration.user_name,
        email: registration.user_email,
        phone: registration.user_phone,
      },
      appRoot,
      appOrigin,
    });
    return [{
      filename: buildReceiptFilename(registration),
      content: pdfBuffer,
      contentType: 'application/pdf',
    }];
  } catch (err) {
    console.warn('[receipt] Could not attach receipt to confirmation:', err.message);
    return [];
  }
}
