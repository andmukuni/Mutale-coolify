import { renderTicketDocumentHtml } from '../shared/ticketDocumentHtml.js';
import { buildTicketViewModel, isGuestTicket, isInPersonEventRecord, isTicketPaymentEligible, resolveAttendeeName } from '../shared/ticketViewModel.js';
import { buildTicketFilename, generateTicketPdfBuffer } from '../shared/ticketPdfServer.js';
import { loadReceiptLogoDataUrl } from '../shared/receiptLogoAsset.js';

function normalizeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

export function buildTicketEmailCopy({
  registration = {},
  event = {},
  recipientName = 'there',
  role = 'attendee',
  appOrigin = '',
} = {}) {
  const eventTitle = String(event.title || registration.event_title || 'Event').trim();
  const attendeeName = resolveAttendeeName(registration);
  const refCode = String(registration.reference_code || '').trim();
  const ticketUrl = appOrigin && refCode
    ? `${String(appOrigin).replace(/\/$/, '')}/tickets/${encodeURIComponent(refCode)}`
    : '';

  if (role === 'buyer_copy') {
    const forLabel = isGuestTicket(registration) ? attendeeName : 'you';
    return {
      subject: `Ticket copy: ${eventTitle} (${forLabel})`,
      previewText: `Your ticket copy for ${eventTitle}.`,
      greeting: `Hi ${recipientName || 'there'},`,
      introLines: [
        `Here is your copy of the entry ticket for ${forLabel === 'you' ? 'your registration' : forLabel}.`,
        ticketUrl ? `View ticket online: ${ticketUrl}` : '',
        'Show the QR code at the gate for entry.',
        refCode ? `Reference: ${refCode}` : '',
      ].filter(Boolean),
    };
  }

  return {
    subject: `Your entry ticket: ${eventTitle}`,
    previewText: `Your entry ticket for ${eventTitle}.`,
    greeting: `Hi ${recipientName || attendeeName || 'there'},`,
    introLines: [
      `Your entry ticket for "${eventTitle}" is ready.`,
      ticketUrl ? `View your ticket and join live: ${ticketUrl}` : '',
      'Show the QR code at the gate for entry.',
      refCode ? `Reference: ${refCode}` : '',
    ].filter(Boolean),
  };
}

export async function isTicketEmailAlreadySent(registrationId, pool) {
  const id = String(registrationId || '').trim();
  if (!id || !pool) return false;
  const [rows] = await pool.query(
    'SELECT ticket_email_sent_at FROM event_registrations WHERE id = ? LIMIT 1',
    [id],
  );
  return Boolean(rows[0]?.ticket_email_sent_at);
}

export async function markTicketEmailSent(registrationId, pool) {
  const id = String(registrationId || '').trim();
  if (!id || !pool) return;
  await pool.query(
    'UPDATE event_registrations SET ticket_email_sent_at = ? WHERE id = ?',
    [new Date(), id],
  );
}

function buildTicketEmailHtmlWrapper({ copy, ticketHtml }) {
  const bodyLines = [...(copy.introLines || []), '<div style="margin-top:16px"></div>'];
  const introHtml = bodyLines.map((line) => {
    if (line.startsWith('<div')) return line;
    return `<p style="margin:0 0 12px;color:#0f172a;font-size:15px;line-height:1.6">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${copy.subject.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title></head>
<body style="margin:0;background:#eef2f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${copy.previewText}</div>
<div style="padding:24px 12px">
<div style="max-width:720px;margin:0 auto">
<p style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:600">${copy.greeting.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
${introHtml}
<div style="margin-top:8px">${ticketHtml}</div>
<p style="margin:20px 0 0;font-size:12px;color:#64748b">Best regards,<br/>Mutale Mubanga</p>
</div></div></body></html>`;
}

/**
 * @param {object} opts
 */
export async function sendTicketEmail({
  registration = {},
  event = {},
  to = '',
  recipientName = '',
  role = 'attendee',
  settings,
  sendEmailNotification,
  appRoot = '',
  appOrigin = '',
}) {
  const recipient = normalizeEmail(to);
  if (!recipient) {
    return { status: 'skipped', reason: 'No valid recipient email.' };
  }

  const copy = buildTicketEmailCopy({ registration, event, recipientName, role, appOrigin });
  const logoDataUrl = await loadReceiptLogoDataUrl(appRoot);
  const viewModel = await buildTicketViewModel({
    registration,
    event,
    appOrigin,
    logoDataUrl,
  });
  const ticketHtml = renderTicketDocumentHtml(viewModel, { outerPadding: true });

  let pdfBuffer;
  try {
    pdfBuffer = await generateTicketPdfBuffer({
      registration,
      event,
      appOrigin,
      logoDataUrl,
    });
  } catch (err) {
    console.error('[ticket] PDF generation failed:', err.message);
    return { status: 'failed', reason: err.message };
  }

  const text = [
    copy.greeting,
    '',
    ...copy.introLines,
    '',
    'Your entry ticket is attached to this email.',
    '',
    'Best regards,',
    'Mutale Mubanga',
  ].join('\n');

  const html = buildTicketEmailHtmlWrapper({ copy, ticketHtml });
  const filename = buildTicketFilename(registration);

  const result = await sendEmailNotification({
    settings,
    to: recipient,
    subject: copy.subject,
    text,
    html,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });

  return result?.status === 'sent'
    ? { status: 'sent', recipient }
    : { status: 'failed', reason: result?.reason || 'Email send failed.' };
}

/**
 * Send guest + buyer copy ticket emails for one registration row.
 */
export async function sendTicketEmailsForRegistration({
  registration = {},
  event = {},
  settings,
  sendEmailNotification,
  appRoot = '',
  appOrigin = '',
  pool = null,
  skipIdempotencyCheck = false,
}) {
  if (!isTicketPaymentEligible(registration)) {
    return { status: 'skipped', reason: 'Ticket not eligible (cancelled or unpaid).' };
  }

  const isVirtual = !isInPersonEventRecord(event, registration);
  const guestEmail = isGuestTicket(registration)
    ? normalizeEmail(registration.booked_for_email)
    : '';

  // In-person: send PDF ticket emails. Virtual: email guest portal link when guest email is set.
  if (isVirtual && !guestEmail) {
    return { status: 'skipped', reason: 'Virtual event ticket email requires guest email.' };
  }

  const regId = String(registration.id || '').trim();
  if (pool && !skipIdempotencyCheck && regId) {
    const alreadySent = await isTicketEmailAlreadySent(regId, pool);
    if (alreadySent) {
      return { status: 'skipped', reason: 'Ticket emails already sent.' };
    }
  }

  const guestEmailResolved = isGuestTicket(registration)
    ? normalizeEmail(registration.booked_for_email)
    : '';
  const buyerEmail = normalizeEmail(registration.user_email);
  const buyerName = String(registration.user_name || '').trim() || 'there';
  const guestName = resolveAttendeeName(registration);

  const sends = [];

  if (guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration,
      event,
      to: guestEmailResolved,
      recipientName: guestName,
      role: 'attendee',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
    }));
  }

  if (buyerEmail && buyerEmail !== guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration,
      event,
      to: buyerEmail,
      recipientName: buyerName,
      role: 'buyer_copy',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
    }));
  } else if (buyerEmail && !guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration,
      event,
      to: buyerEmail,
      recipientName: buyerName,
      role: 'buyer_copy',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
    }));
  } else if (!guestEmailResolved && !buyerEmail) {
    return { status: 'skipped', reason: 'No recipient email.' };
  }

  const results = await Promise.all(sends);
  const sentCount = results.filter((r) => r.status === 'sent').length;
  const failed = results.find((r) => r.status === 'failed');

  if (sentCount > 0 && pool && regId) {
    await markTicketEmailSent(regId, pool);
  }

  if (failed) {
    return { status: 'partial', sentCount, reason: failed.reason };
  }
  if (sentCount === 0) {
    return { status: 'skipped', reason: 'No ticket emails sent.' };
  }
  return { status: 'sent', sentCount };
}

export async function maybeSendTicketEmailsOnSettlement({
  registration = {},
  event = {},
  settings,
  sendEmailNotification,
  appRoot = '',
  appOrigin = '',
  pool = null,
}) {
  return sendTicketEmailsForRegistration({
    registration,
    event,
    settings,
    sendEmailNotification,
    appRoot,
    appOrigin,
    pool,
  });
}

export async function generateRegistrationTicketBuffer({
  registration = {},
  event = {},
  appRoot = '',
  appOrigin = '',
}) {
  const logoDataUrl = await loadReceiptLogoDataUrl(appRoot);
  return generateTicketPdfBuffer({
    registration,
    event,
    appOrigin,
    logoDataUrl,
  });
}
