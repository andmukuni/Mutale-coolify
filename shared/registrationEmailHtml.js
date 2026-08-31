import {
  EMAIL_BRAND_COLORS,
  PUBLIC_WHITE_LOGO_PATH,
  accentBarHtml,
  brandFooterHtml,
  brandHeaderHtml,
  escapeHtml,
  resolveLogoSrc,
} from './brandedEmailHtml.js';

const {
  navy: NAVY,
  navyText: NAVY_TEXT,
  teal: TEAL,
  coral: CORAL,
  gray: GRAY,
  light: LIGHT,
  border: BORDER,
  emailBg: EMAIL_BG,
  link: LINK_BLUE,
} = EMAIL_BRAND_COLORS;

function initialsFromName(name) {
  return String(name || 'G')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'G';
}

function iconBox(svg) {
  return `<div style="width:36px;height:36px;border:1px solid #d7e8e8;border-radius:10px;background:#ffffff;text-align:center;line-height:34px">
    ${svg}
  </div>`;
}

const ICONS = {
  calendar: iconBox(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`),
  clock: iconBox(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`),
  pin: iconBox(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>`),
  tag: iconBox(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M20.6 13.4 12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v5.9a2 2 0 0 1-.6 1.4z"/><circle cx="16.5" cy="7.5" r="1.2" fill="${TEAL}" stroke="none"/></svg>`),
};

function detailRow({ icon, label, value, last = false }) {
  return `
    <tr>
      <td style="padding:${last ? '14px 0 4px' : '14px 0'};width:44px;vertical-align:middle">${icon}</td>
      <td style="padding:${last ? '14px 0 4px 10px' : '14px 0 14px 10px'};${last ? '' : `border-bottom:1px solid ${BORDER};`}vertical-align:middle">
        <div style="font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${TEAL};line-height:1.3">${escapeHtml(label)}</div>
        <div style="font-size:16px;font-weight:800;color:${NAVY_TEXT};line-height:1.35;margin-top:2px">${escapeHtml(value)}</div>
      </td>
    </tr>`;
}

/**
 * Branded HTML for event registration confirmation emails.
 * Layout matches the registration-confirmed screenshot (table-based for clients).
 */
export function buildRegistrationEmailHtml({
  recipientName = 'there',
  recipientEmail = '',
  eventTitle = '',
  eventDate = 'TBA',
  eventTime = '',
  eventLocation = 'Online',
  registrationTypeLabel = '',
  referenceCode = '',
  accessPassUrl = '',
  ticketUrl = '',
  addToCalendarUrl = '',
  statusLabel = 'CONFIRMED',
  statusNote = '',
  previewText = 'You are registered! Your registration has been received.',
  logoDataUrl = '',
  logoUrl = '',
  brand = {},
} = {}) {
  void registrationTypeLabel;
  void addToCalendarUrl;
  void statusLabel;
  void statusNote;

  const brandName = escapeHtml(brand.name || 'Mutale Mubanga');
  const brandTagline = escapeHtml(brand.tagline || 'Growing People.');
  const websiteUrl = String(brand.websiteUrl || '').replace(/\/$/, '');
  const websiteLabel = escapeHtml(
    brand.websiteLabel || (websiteUrl ? websiteUrl.replace(/^https?:\/\//, '') : 'mutalemubanga.org'),
  );
  const viewTicketUrl = ticketUrl || accessPassUrl || '';

  const safeName = escapeHtml(recipientName || 'there');
  const safeEmail = escapeHtml(recipientEmail);
  const initials = escapeHtml(initialsFromName(recipientName));
  const logoSrc = resolveLogoSrc({ logoUrl, logoDataUrl, websiteUrl });

  const details = [
    eventTitle ? { icon: ICONS.calendar, label: 'Event', value: eventTitle } : null,
    { icon: ICONS.calendar, label: 'Date', value: eventDate || 'TBA' },
    eventTime ? { icon: ICONS.clock, label: 'Time', value: eventTime } : null,
    { icon: ICONS.pin, label: 'Venue', value: eventLocation || 'Online' },
    referenceCode ? { icon: ICONS.tag, label: 'Registration ID', value: referenceCode } : null,
  ].filter(Boolean);

  const rowsHtml = details
    .map((row, index) => detailRow({ ...row, last: index === details.length - 1 }))
    .join('');

  const viewTicketButton = viewTicketUrl
    ? `<a href="${escapeHtml(viewTicketUrl)}" target="_blank" style="display:block;text-align:center;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:.2px;padding:14px 22px;border-radius:12px;background:${TEAL};color:#ffffff">View Ticket &rarr;</a>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(eventTitle ? `Registration Confirmed: ${eventTitle}` : 'Registration Confirmed')}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_BG};font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG}">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(11,27,58,0.10)">
            <tr>
              <td style="background:${NAVY};padding:22px 28px 20px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle">
                      ${brandHeaderHtml({ logoSrc, brandName, brandTagline })}
                    </td>
                    <td style="vertical-align:middle;text-align:right;width:150px">
                      <div style="display:inline-block;width:44px;height:44px;background:${TEAL};border-radius:50%;text-align:center;line-height:44px;color:#ffffff;font-size:22px;font-weight:700">&#10003;</div>
                      <div style="font-size:10px;font-weight:800;letter-spacing:.8px;color:${TEAL};text-transform:uppercase;margin-top:7px;line-height:1.35">Registration<br/>Confirmed</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0">${accentBarHtml()}</td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px">
                <p style="margin:0 0 8px;color:${GRAY};font-size:16px">Hi ${safeName},</p>
                <h1 style="margin:0 0 14px;color:${NAVY_TEXT};font-size:30px;line-height:1.2;font-weight:800">You are registered!</h1>
                <p style="margin:0 0 6px;color:${GRAY};font-size:15px;line-height:1.65">Your registration for the event below has been received successfully.</p>
                <p style="margin:0 0 8px;color:${GRAY};font-size:15px;line-height:1.65">Please keep this email for your records.</p>
                <p style="margin:0 0 22px;color:${TEAL};font-size:15px;line-height:1.65;font-weight:800">We look forward to welcoming you.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LIGHT};border-radius:14px;margin:0 0 26px">
                  <tr>
                    <td style="padding:18px 20px">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="vertical-align:middle">
                          <div style="width:48px;height:48px;border-radius:50%;background:#ffffff;border:2px solid ${TEAL};text-align:center;line-height:44px;color:${TEAL};font-size:16px;font-weight:800">${initials}</div>
                        </td>
                        <td style="vertical-align:middle;padding-left:16px">
                          <div style="font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${TEAL}">Registrant</div>
                          <div style="font-size:17px;font-weight:800;color:${NAVY_TEXT};margin-top:2px">${safeName}</div>
                          ${safeEmail ? `<a href="mailto:${safeEmail}" style="font-size:13px;color:${LINK_BLUE};text-decoration:underline;margin-top:2px;display:inline-block">${safeEmail}</a>` : ''}
                        </td>
                      </tr></table>
                    </td>
                  </tr>
                </table>

                <div style="font-size:13px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${TEAL};margin:0 0 4px">Event Details</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 10px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-bottom:1px solid ${BORDER};font-size:0;line-height:0">&nbsp;</td>
                    <td style="width:36px;text-align:center;color:${TEAL};font-size:16px;line-height:1">&#9825;</td>
                    <td style="border-bottom:1px solid ${BORDER};font-size:0;line-height:0">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;text-align:center">
                <p style="margin:0 0 4px;color:${GRAY};font-size:14px;line-height:1.6">We are excited to have you join us.</p>
                <p style="margin:0 0 20px;color:${GRAY};font-size:14px;line-height:1.6">If you have any questions, feel free to reach out.</p>
                ${viewTicketButton ? `<div style="margin:0 auto 22px;max-width:420px">${viewTicketButton}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 8px">
                ${brandFooterHtml({ brandTagline, websiteUrl, websiteLabel })}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export { PUBLIC_WHITE_LOGO_PATH, resolveLogoSrc };
