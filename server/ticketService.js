import { renderTicketDocumentHtml } from '../shared/ticketDocumentHtml.js';
import { buildTicketViewModel, isGuestTicket, isInPersonEventRecord, isTicketPaymentEligible, resolveAttendeeName, resolveAttendeePhone } from '../shared/ticketViewModel.js';
import { buildTicketFilename, generateTicketPdfBuffer } from '../shared/ticketPdfServer.js';
import { loadReceiptLogoDataUrl } from '../shared/receiptLogoAsset.js';
import {
  defaultEmailBrand,
  escapeHtml,
  publicLogoUrl,
  wrapBrandedEmailHtml,
} from '../shared/brandedEmailHtml.js';
import { buildRegistrationEmailHtml } from '../shared/registrationEmailHtml.js';
import {
  buildPersonTemplateVars,
  buildThankYouLine,
  formatFirstNameSentenceCase,
  getSystemTemplate,
  renderTemplate,
} from '../shared/notificationTemplates.js';
import { applyNotificationTemplates } from './notificationTemplateService.js';
import { uniqueSmsRecipients } from './emailSmsCompanion.js';
import { issueGuestLinkBundle } from '../shared/guestAccessToken.js';

export { formatFirstNameSentenceCase };

function normalizeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function ticketTemplateVars({
  registration = {},
  event = {},
  ticketUrl = '',
  joinUrl = '',
  surveyUrl = '',
  recipientName = '',
} = {}) {
  const purchaserName = String(registration.user_name || recipientName || '').trim();
  const eventTitle = String(event.title || registration.event_title || '').trim().replace(/\.+$/, '');
  return {
    ...buildPersonTemplateVars(purchaserName),
    event_title: eventTitle,
    ticket_url: String(ticketUrl || '').trim(),
    join_url: String(joinUrl || ticketUrl || '').trim(),
    survey_url: String(surveyUrl || '').trim(),
    reference: String(registration.reference_code || '').trim(),
  };
}

export function buildTicketSmsMessage({
  registration = {},
  event = {},
  ticketUrl = '',
  joinUrl = '',
} = {}) {
  const vars = ticketTemplateVars({ registration, event, ticketUrl, joinUrl });
  const catalog = getSystemTemplate('ticket', 'sms');
  if (catalog?.body) return renderTemplate(catalog.body, vars);
  const titlePart = vars.event_title ? `${vars.event_title}.` : '';
  const linkPart = vars.join_url
    ? `Join with your guest token: ${vars.join_url}`
    : (vars.ticket_url ? `View your ticket here: ${vars.ticket_url}` : '');
  return [vars.thank_you || buildThankYouLine(registration.user_name), titlePart, linkPart].filter(Boolean).join(' ');
}

export function buildTicketEmailCopy({
  registration = {},
  event = {},
  recipientName = 'there',
  role = 'attendee',
  appOrigin = '',
  joinUrl = '',
} = {}) {
  const eventTitle = String(event.title || registration.event_title || 'Event').trim();
  const attendeeName = resolveAttendeeName(registration);
  const refCode = String(registration.reference_code || '').trim();
  const ticketUrl = appOrigin && refCode
    ? `${String(appOrigin).replace(/\/$/, '')}/tickets/${encodeURIComponent(refCode)}`
    : '';
  const liveJoinUrl = String(joinUrl || '').trim();

  if (role === 'buyer_copy') {
    const forLabel = isGuestTicket(registration) ? attendeeName : 'you';
    return {
      subject: `Ticket copy: ${eventTitle} (${forLabel})`,
      previewText: `Your ticket copy for ${eventTitle}.`,
      ticketUrl,
      joinUrl: liveJoinUrl,
      greeting: `Hi ${recipientName || 'there'},`,
      introLines: [
        `Here is your copy of the entry ticket for ${forLabel === 'you' ? 'your registration' : forLabel}.`,
        ticketUrl ? `View ticket online: ${ticketUrl}` : '',
        liveJoinUrl ? `Guest join link (includes access token): ${liveJoinUrl}` : '',
        'Show the QR code at the gate for entry.',
        refCode ? `Reference: ${refCode}` : '',
      ].filter(Boolean),
    };
  }

  return {
    subject: `Your entry ticket: ${eventTitle}`,
    previewText: `Your entry ticket for ${eventTitle}.`,
    ticketUrl,
    joinUrl: liveJoinUrl,
    greeting: `Hi ${recipientName || attendeeName || 'there'},`,
    introLines: [
      `Your entry ticket for "${eventTitle}" is ready.`,
      ticketUrl ? `View your ticket: ${ticketUrl}` : '',
      liveJoinUrl ? `Join the meeting with your guest token: ${liveJoinUrl}` : '',
      'Show the QR code at the gate for entry.',
      refCode ? `Reference: ${refCode}` : '',
    ].filter(Boolean),
  };
}

export function willSendTicketNotifications({ registration = {}, event = {} } = {}) {
  if (!isTicketPaymentEligible(registration)) return false;
  const isVirtual = !isInPersonEventRecord(event, registration);
  const guestEmail = isGuestTicket(registration)
    ? normalizeEmail(registration.booked_for_email)
    : '';
  if (isVirtual && !guestEmail) return false;
  const buyerEmail = normalizeEmail(registration.user_email);
  return Boolean(guestEmail || buyerEmail);
}

/**
 * Complimentary (free / not_required / waived) and paid registrations both post SMS.
 * When ticket emails will carry the companion SMS, skip a second registration SMS.
 */
export function shouldSendRegistrationSms({ registration = {}, event = {} } = {}) {
  if (!isTicketPaymentEligible(registration)) return false;
  return !willSendTicketNotifications({ registration, event });
}

function withBuyerPhone(registration = {}, buyerPhone = '') {
  const existing = String(registration.user_phone || '').trim();
  const fallback = String(buyerPhone || '').trim();
  if (existing || !fallback) return registration;
  return { ...registration, user_phone: fallback };
}

export async function sendRegistrationConfirmationIfNeeded({
  registration = {},
  event = {},
  settings,
  sendEmailNotification,
  appOrigin = '',
  smsTo = '',
  recipientEmail = '',
  recipientName = '',
  signJwtHmacSha256,
  authSecret,
} = {}) {
  const row = withBuyerPhone(registration, smsTo);
  if (!shouldSendRegistrationSms({ registration: row, event })) {
    return { status: 'skipped', reason: 'Ticket SMS will be sent, or registration is not eligible.' };
  }

  const to = normalizeEmail(recipientEmail || row.user_email);
  if (!to) {
    return { status: 'skipped', reason: 'No valid recipient email.' };
  }

  const origin = String(appOrigin || '').replace(/\/$/, '');
  const eventTitle = String(event.title || row.event_title || 'Event').trim();
  const refCode = String(row.reference_code || '').trim();
  const eventUrl = event.slug && origin
    ? `${origin}/events/${encodeURIComponent(event.slug)}`
    : origin;
  const links = issueGuestLinkBundle({
    registration: row,
    event,
    origin,
    signJwtHmacSha256,
    authSecret,
  });
  const ticketUrl = links.ticket_url || (refCode && origin
    ? `${origin}/tickets/${encodeURIComponent(refCode)}`
    : eventUrl);
  const joinUrl = links.join_url;
  const name = String(recipientName || row.user_name || '').trim() || 'there';
  const phone = String(smsTo || row.user_phone || resolveAttendeePhone(row) || '').trim();
  const eventDate = event.start_date || event.date
    ? new Date(event.start_date || event.date).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    : 'TBA';
  const eventTime = [event.start_time, event.end_time].filter(Boolean).join(' – ') || event.time || '';
  const eventLocation = event.location || event.venue
    || (String(event.event_mode || '').toLowerCase() === 'in_person' ? 'TBA' : 'Online');

  const result = await sendEmailNotification({
    settings,
    to,
    subject: `Registration Confirmed: ${eventTitle}`,
    text: [
      `Hi ${name},`,
      '',
      `Thank you for registering for "${eventTitle}"! Your registration is confirmed.`,
      refCode ? `Reference: ${refCode}` : '',
      ticketUrl ? `View your ticket: ${ticketUrl}` : '',
      joinUrl ? `Join with your guest token: ${joinUrl}` : '',
    ].filter(Boolean).join('\n'),
    html: buildRegistrationEmailHtml({
      recipientName: name,
      recipientEmail: to,
      eventTitle,
      eventDate,
      eventTime,
      eventLocation,
      referenceCode: refCode,
      ticketUrl: ticketUrl || eventUrl,
      logoUrl: publicLogoUrl(origin),
      brand: defaultEmailBrand(origin),
    }),
    smsTo: phone,
    smsMessage: [
      `Registration confirmed: ${eventTitle}.`,
      refCode ? `Ref: ${refCode}` : '',
      joinUrl || ticketUrl,
    ].filter(Boolean).join(' '),
    kind: 'registration',
    skipSms: false,
    templateSlug: 'registration',
    templateVars: {
      ...buildPersonTemplateVars(name),
      event_title: eventTitle,
      reference: refCode,
      ticket_url: ticketUrl || eventUrl,
      join_url: joinUrl,
      event_url: eventUrl,
    },
  });

  return result?.status === 'sent'
    ? { status: 'sent' }
    : { status: result?.status || 'failed', reason: result?.reason };
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

function buildTicketEmailHtmlWrapper({ copy, ticketHtml, appOrigin = '' }) {
  const introHtml = (copy.introLines || [])
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px;color:#64748b;font-size:15px;line-height:1.65">${escapeHtml(line)}</p>`)
    .join('');
  const origin = String(appOrigin || '').replace(/\/$/, '');

  return wrapBrandedEmailHtml({
    title: copy.subject,
    previewText: copy.previewText,
    logoUrl: publicLogoUrl(origin),
    brand: defaultEmailBrand(origin),
    innerHtml: `
      <p style="margin:0 0 8px;color:#64748b;font-size:16px">${escapeHtml(copy.greeting)}</p>
      <h1 style="margin:0 0 14px;color:#141D45;font-size:26px;line-height:1.25;font-weight:800">${escapeHtml(copy.subject)}</h1>
      ${introHtml}
      <div style="margin-top:16px">${ticketHtml}</div>
    `,
  });
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
  pool = null,
  skipSms = false,
  signJwtHmacSha256,
  authSecret,
}) {
  const recipient = normalizeEmail(to);
  if (!recipient) {
    return { status: 'skipped', reason: 'No valid recipient email.' };
  }

  const links = issueGuestLinkBundle({
    registration,
    event,
    origin: appOrigin,
    signJwtHmacSha256,
    authSecret,
  });
  const copy = buildTicketEmailCopy({
    registration,
    event,
    recipientName,
    role,
    appOrigin,
    joinUrl: links.join_url,
  });
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

  const html = buildTicketEmailHtmlWrapper({ copy, ticketHtml, appOrigin });
  const filename = buildTicketFilename(registration);

  const smsTo = role === 'buyer_copy'
    ? String(registration.user_phone || resolveAttendeePhone(registration) || '').trim()
    : resolveAttendeePhone(registration);
  const ticketUrl = String(copy.ticketUrl || links.ticket_url || '').trim();
  const joinUrl = String(copy.joinUrl || links.join_url || '').trim();
  const slug = role === 'buyer_copy' ? 'ticket_buyer' : 'ticket';
  const vars = ticketTemplateVars({
    registration,
    event,
    ticketUrl,
    joinUrl,
    surveyUrl: links.survey_url,
    recipientName,
  });
  const applied = await applyNotificationTemplates(pool, {
    slug,
    vars,
    subject: copy.subject,
    text,
    smsMessage: buildTicketSmsMessage({ registration, event, ticketUrl, joinUrl }),
  });
  const result = await sendEmailNotification({
    settings,
    to: recipient,
    subject: applied.subject,
    text: applied.text,
    html,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
    smsTo,
    smsMessage: applied.smsMessage,
    kind: 'ticket',
    skipSms,
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
  buyerPhone = '',
  signJwtHmacSha256,
  authSecret,
}) {
  const row = withBuyerPhone(registration, buyerPhone);
  if (!isTicketPaymentEligible(row)) {
    return { status: 'skipped', reason: 'Ticket not eligible (cancelled or unpaid).' };
  }

  const isVirtual = !isInPersonEventRecord(event, row);
  const guestEmail = isGuestTicket(row)
    ? normalizeEmail(row.booked_for_email)
    : '';

  // In-person: send PDF ticket emails. Virtual: email guest portal link when guest email is set.
  if (isVirtual && !guestEmail) {
    return { status: 'skipped', reason: 'Virtual event ticket email requires guest email.' };
  }

  const regId = String(row.id || '').trim();
  if (pool && !skipIdempotencyCheck && regId) {
    const alreadySent = await isTicketEmailAlreadySent(regId, pool);
    if (alreadySent) {
      return { status: 'skipped', reason: 'Ticket emails already sent.' };
    }
  }

  const guestEmailResolved = isGuestTicket(row)
    ? normalizeEmail(row.booked_for_email)
    : '';
  const buyerEmail = normalizeEmail(row.user_email);
  const buyerName = String(row.user_name || '').trim() || 'there';
  const guestName = resolveAttendeeName(row);

  const sends = [];
  const attendeePhone = resolveAttendeePhone(row);
  const resolvedBuyerPhone = String(row.user_phone || '').trim();
  const sharedTicketPhones = uniqueSmsRecipients([attendeePhone, resolvedBuyerPhone]);
  const sameTicketSmsPhone = sharedTicketPhones.length === 1;

  if (guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration: row,
      event,
      to: guestEmailResolved,
      recipientName: guestName,
      role: 'attendee',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
      pool,
      signJwtHmacSha256,
      authSecret,
    }));
  }

  if (buyerEmail && buyerEmail !== guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration: row,
      event,
      to: buyerEmail,
      recipientName: buyerName,
      role: 'buyer_copy',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
      pool,
      skipSms: Boolean(guestEmailResolved && sameTicketSmsPhone),
      signJwtHmacSha256,
      authSecret,
    }));
  } else if (buyerEmail && !guestEmailResolved) {
    sends.push(sendTicketEmail({
      registration: row,
      event,
      to: buyerEmail,
      recipientName: buyerName,
      role: 'buyer_copy',
      settings,
      sendEmailNotification,
      appRoot,
      appOrigin,
      pool,
      signJwtHmacSha256,
      authSecret,
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
  buyerPhone = '',
  signJwtHmacSha256,
  authSecret,
}) {
  return sendTicketEmailsForRegistration({
    registration,
    event,
    settings,
    sendEmailNotification,
    appRoot,
    appOrigin,
    pool,
    buyerPhone,
    signJwtHmacSha256,
    authSecret,
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
