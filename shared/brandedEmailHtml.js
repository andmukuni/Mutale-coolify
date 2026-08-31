/** Brand chrome shared by every outbound HTML email. */

export const EMAIL_BRAND_COLORS = {
  navy: '#0B1B3A',
  navyText: '#141D45',
  teal: '#00A79D',
  coral: '#E76869',
  gray: '#64748b',
  light: '#eef6f6',
  border: '#e6ebf0',
  emailBg: '#eef2f5',
  link: '#2563eb',
};

export const PUBLIC_WHITE_LOGO_PATH = '/Logo-Website-Mutale_White%20No%20Bg.png';

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

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function defaultEmailBrand(websiteUrl = '') {
  const origin = String(websiteUrl || '').replace(/\/$/, '');
  return {
    name: 'Mutale Mubanga',
    tagline: 'Growing People.',
    websiteUrl: origin || 'https://mutalemubanga.org',
    websiteLabel: (origin || 'https://mutalemubanga.org').replace(/^https?:\/\//, ''),
  };
}

export function resolveLogoSrc({ logoUrl = '', logoDataUrl = '', websiteUrl = '' } = {}) {
  if (logoUrl) return logoUrl;
  if (logoDataUrl) return logoDataUrl;
  const origin = String(websiteUrl || '').replace(/\/$/, '');
  return origin ? `${origin}${PUBLIC_WHITE_LOGO_PATH}` : '';
}

export function publicLogoUrl(websiteUrl = '') {
  const origin = String(websiteUrl || '').replace(/\/$/, '');
  return origin ? `${origin}${PUBLIC_WHITE_LOGO_PATH}` : '';
}

export function linkifyEscapedText(escaped) {
  return String(escaped || '').replace(
    /(https?:\/\/[^\s<]+)/g,
    `<a href="$1" style="color:${LINK_BLUE};word-break:break-all;text-decoration:underline">$1</a>`,
  );
}

function brandHeaderHtml({ logoSrc, brandName, brandTagline }) {
  const mark = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${brandName}" height="56" width="56" style="display:block;height:56px;width:56px;object-fit:contain;border:0;outline:none;text-decoration:none" />`
    : `<div style="width:56px;height:56px;border:2px solid ${TEAL};border-radius:12px;text-align:center;line-height:52px;color:#ffffff;font-size:24px;font-weight:800">M</div>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;width:56px">${mark}</td>
    <td style="vertical-align:middle;padding-left:12px">
      <div style="font-size:18px;font-weight:800;letter-spacing:.4px;color:#ffffff;line-height:1.2">MUTALE <span style="color:${TEAL}">MUBANGA</span></div>
      <div style="font-size:12px;color:#d5deea;margin-top:3px">${brandTagline}</div>
    </td>
  </tr></table>`;
}

function cornerDots(side) {
  const cells = side === 'left'
    ? [
      [0.10, 0.16, 0.10, 0, 0],
      [0.16, 0.28, 0.22, 0.10, 0],
      [0.10, 0.22, 0.34, 0.18, 0.08],
      [0, 0.10, 0.18, 0.12, 0],
      [0, 0, 0.08, 0, 0],
    ]
    : [
      [0, 0, 0.10, 0.16, 0.10],
      [0, 0.10, 0.22, 0.28, 0.16],
      [0.08, 0.18, 0.34, 0.22, 0.10],
      [0, 0.12, 0.18, 0.10, 0],
      [0, 0, 0.08, 0, 0],
    ];

  const rows = cells.map((row) => `<tr>${row.map((alpha) => {
    if (!alpha) return '<td style="width:7px;height:7px;padding:1px"></td>';
    const color = `rgba(0,167,157,${alpha})`;
    return `<td style="width:7px;height:7px;padding:1px"><div style="width:5px;height:5px;border-radius:50%;background:${color};font-size:0;line-height:0">&nbsp;</div></td>`;
  }).join('')}</tr>`).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function accentBarHtml() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background:${TEAL};height:5px;line-height:5px;font-size:0;width:74%">&nbsp;</td>
    <td style="background:${CORAL};height:5px;line-height:5px;font-size:0;width:26%">&nbsp;</td>
  </tr></table>`;
}

function brandFooterHtml({ brandTagline, websiteUrl, websiteLabel }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="vertical-align:bottom;width:80px">${cornerDots('left')}</td>
      <td style="text-align:center;padding:8px 10px 18px">
        <div style="color:${TEAL};font-size:15px;font-weight:700;margin-bottom:8px">${brandTagline}</div>
        <a href="${escapeHtml(websiteUrl || 'https://mutalemubanga.org')}" target="_blank" style="color:${NAVY_TEXT};font-size:14px;font-weight:600;text-decoration:none">
          <span style="color:${TEAL};margin-right:6px">&#127760;</span>${websiteLabel}
        </a>
      </td>
      <td style="vertical-align:bottom;width:80px;text-align:right">${cornerDots('right')}</td>
    </tr>
  </table>`;
}

function codeBoxHtml(code) {
  return `<div style="margin:8px 0 22px;padding:18px 16px;border-radius:14px;background:${LIGHT};border:1px solid ${BORDER};text-align:center">
    <div style="font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${TEAL};margin-bottom:8px">Verification code</div>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:${NAVY_TEXT};line-height:1.2">${escapeHtml(code)}</div>
  </div>`;
}

function resolveBrand(brand = {}, websiteUrl = '') {
  const defaults = defaultEmailBrand(websiteUrl || brand.websiteUrl);
  const origin = String(brand.websiteUrl || defaults.websiteUrl || '').replace(/\/$/, '');
  return {
    name: escapeHtml(brand.name || defaults.name),
    tagline: escapeHtml(brand.tagline || defaults.tagline),
    websiteUrl: origin,
    websiteLabel: escapeHtml(
      brand.websiteLabel || defaults.websiteLabel || origin.replace(/^https?:\/\//, ''),
    ),
  };
}

/**
 * Wrap already-safe HTML in the navy / teal / coral Mutale email chrome.
 */
export function wrapBrandedEmailHtml({
  title = 'Mutale Mubanga',
  previewText = '',
  innerHtml = '',
  logoUrl = '',
  logoDataUrl = '',
  brand = {},
  headerExtraHtml = '',
} = {}) {
  const resolved = resolveBrand(brand);
  const logoSrc = resolveLogoSrc({ logoUrl, logoDataUrl, websiteUrl: resolved.websiteUrl });
  const headerExtra = headerExtraHtml
    ? `<td style="vertical-align:middle;text-align:right;width:150px">${headerExtraHtml}</td>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
                      ${brandHeaderHtml({ logoSrc, brandName: resolved.name, brandTagline: resolved.tagline })}
                    </td>
                    ${headerExtra}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0">${accentBarHtml()}</td>
            </tr>
            <tr>
              <td style="padding:32px 32px 12px">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 8px">
                ${brandFooterHtml(resolved)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Generic branded email: greeting, body lines, optional CTA / verification code.
 */
export function buildBrandedEmailHtml({
  title,
  previewText = '',
  greeting = 'Hi there,',
  bodyLines = [],
  buttonText = '',
  buttonUrl = '',
  footerLines = [],
  code = '',
  logoUrl = '',
  logoDataUrl = '',
  brand = {},
} = {}) {
  const safeGreeting = String(greeting || '').trim();
  const greetingHtml = safeGreeting
    ? `<p style="margin:0 0 8px;color:${GRAY};font-size:16px">${escapeHtml(safeGreeting)}</p>`
    : '';
  const titleHtml = title
    ? `<h1 style="margin:0 0 14px;color:${NAVY_TEXT};font-size:26px;line-height:1.25;font-weight:800">${escapeHtml(title)}</h1>`
    : '';
  const bodyHtml = (Array.isArray(bodyLines) ? bodyLines : [])
    .filter((line) => String(line || '').trim())
    .map((line) => `<p style="margin:0 0 12px;color:${GRAY};font-size:15px;line-height:1.65">${linkifyEscapedText(escapeHtml(line))}</p>`)
    .join('');
  const codeHtml = String(code || '').trim() ? codeBoxHtml(code) : '';
  const button = buttonText && buttonUrl
    ? `<div style="margin:18px 0 8px">
        <a href="${escapeHtml(buttonUrl)}" target="_blank" style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">
          ${escapeHtml(buttonText)}
        </a>
      </div>
      <p style="margin:10px 0 0;color:${GRAY};font-size:12px;line-height:1.6">
        If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/>
        <span style="word-break:break-all">${escapeHtml(buttonUrl)}</span>
      </p>`
    : '';
  const extraFooter = (Array.isArray(footerLines) ? footerLines : [])
    .filter((line) => String(line || '').trim())
    .map((line) => `<p style="margin:14px 0 0;color:${GRAY};font-size:13px;line-height:1.6">${escapeHtml(line)}</p>`)
    .join('');

  return wrapBrandedEmailHtml({
    title: title || 'Mutale Mubanga',
    previewText,
    logoUrl,
    logoDataUrl,
    brand,
    innerHtml: `${greetingHtml}${titleHtml}${bodyHtml}${codeHtml}${button}${extraFooter}`,
  });
}

/**
 * Turn a plain-text email body into branded HTML (used when a sender forgets html).
 */
export function buildBrandedEmailFromText({
  title,
  text = '',
  buttonText = '',
  buttonUrl = '',
  logoUrl = '',
  logoDataUrl = '',
  brand = {},
} = {}) {
  const lines = String(text || '').split(/\n/);
  return buildBrandedEmailHtml({
    title,
    previewText: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    greeting: '',
    bodyLines: lines,
    buttonText,
    buttonUrl,
    logoUrl,
    logoDataUrl,
    brand,
  });
}

export {
  brandHeaderHtml,
  brandFooterHtml,
  accentBarHtml,
  cornerDots,
};
