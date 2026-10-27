/**
 * The one footer every outbound email ends with — notifications and campaigns alike.
 * Admins edit it under Templates → Email footer; it is stored as system_settings.emailFooter.
 */

const NAVY = '#141D45';
const TEAL = '#00A79D';
const MUTED = '#7a8794';
const RULE = '#d9e2e8';
const FONT = 'Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const HEADLINE_FONT = "Jost,Futura,'Century Gothic','Avenir Next','Helvetica Neue',Arial,sans-serif";

export const EMAIL_FOOTER_ASSET_PATH = '/email';

export const EMAIL_FOOTER_SOCIAL_NETWORKS = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
];

/**
 * Notification emails are rendered before the recipient is known, so the
 * manage-subscriptions link starts as this marker and the mailer swaps in a
 * signed link per recipient (see applyRecipientFooterLinks).
 */
export const RECIPIENT_PREFERENCES_MARKER = '{{recipient_preferences_url}}';

export const DEFAULT_EMAIL_FOOTER = {
  headline: 'Growing',
  headlineAccent: 'People.',
  websiteUrl: 'https://mutalemubanga.org',
  websiteLabel: 'mutalemubanga.org',
  social: {
    linkedin: 'https://www.linkedin.com/in/mutale-mubanga',
    x: '',
    youtube: '',
    instagram: '',
    facebook: '',
  },
  manageLabel: 'Manage my subscriptions',
  unsubscribeLabel: 'Unsubscribe',
  notice: 'You are receiving this email because you registered for an event or subscribed to updates from Growing People.',
  copyright: '© {{year}} Growing People. All Rights Reserved.',
  showLeaf: true,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanText(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Accepts "mutalemubanga.org" as well as full links; anything that is not http(s) is dropped. */
export function normalizeFooterUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function normalizeEmailFooter(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const social = input.social && typeof input.social === 'object' ? input.social : {};
  const url = (value, fallback) => (value === undefined ? fallback : normalizeFooterUrl(value));
  return {
    headline: cleanText(input.headline, DEFAULT_EMAIL_FOOTER.headline, 60),
    headlineAccent: cleanText(input.headlineAccent, DEFAULT_EMAIL_FOOTER.headlineAccent, 60),
    websiteUrl: url(input.websiteUrl, DEFAULT_EMAIL_FOOTER.websiteUrl),
    websiteLabel: cleanText(input.websiteLabel, DEFAULT_EMAIL_FOOTER.websiteLabel, 80),
    social: Object.fromEntries(
      EMAIL_FOOTER_SOCIAL_NETWORKS.map(({ key }) => [
        key,
        url(social[key], DEFAULT_EMAIL_FOOTER.social[key]),
      ]),
    ),
    manageLabel: cleanText(input.manageLabel, DEFAULT_EMAIL_FOOTER.manageLabel, 60),
    unsubscribeLabel: cleanText(input.unsubscribeLabel, DEFAULT_EMAIL_FOOTER.unsubscribeLabel, 40),
    notice: cleanText(input.notice, DEFAULT_EMAIL_FOOTER.notice, 400),
    copyright: cleanText(input.copyright, DEFAULT_EMAIL_FOOTER.copyright, 160),
    showLeaf: input.showLeaf === undefined ? DEFAULT_EMAIL_FOOTER.showLeaf : Boolean(input.showLeaf),
  };
}

// Kept in sync with system_settings by the server so synchronous email builders need no DB access.
let activeFooter = normalizeEmailFooter();

export function setActiveEmailFooter(footer) {
  activeFooter = normalizeEmailFooter(footer);
  return activeFooter;
}

export function getActiveEmailFooter() {
  return activeFooter;
}

function withYear(text, year) {
  return String(text || '').replace(/\{\{\s*year\s*\}\}/gi, String(year));
}

function assetUrl(base, name) {
  const origin = String(base || DEFAULT_EMAIL_FOOTER.websiteUrl).replace(/\/$/, '');
  return `${origin}${EMAIL_FOOTER_ASSET_PATH}/${name}`;
}

/** Stack the website and social groups on phones; used by both email document wrappers. */
export const EMAIL_FOOTER_MOBILE_CSS = '@media(max-width:480px){.mm-ft-cell{display:block!important;width:100%!important;border:0!important;padding:0!important;text-align:center!important}.mm-ft-social{padding-top:14px!important}.mm-ft-headline{font-size:30px!important}}';

/**
 * Full-bleed footer row content. `preferencesUrl` / `unsubscribeUrl` are the
 * recipient's personal links; a footer without a preferences link hides that line.
 */
export function renderEmailFooterHtml({
  footer,
  assetBaseUrl = '',
  preferencesUrl = '',
  unsubscribeUrl = '',
  year = new Date().getFullYear(),
} = {}) {
  const f = footer ? normalizeEmailFooter(footer) : activeFooter;
  const headline = [
    f.headline ? escapeHtml(f.headline) : '',
    f.headlineAccent ? `<span style="color:${TEAL}">${escapeHtml(f.headlineAccent)}</span>` : '',
  ].filter(Boolean).join(' ');

  const website = f.websiteUrl
    ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding:0 14px 0 0"><img src="${escapeHtml(assetUrl(assetBaseUrl, 'globe.png'))}" width="24" height="24" alt="" style="display:block;border:0"/></td>
        <td valign="middle" style="border-left:1px solid ${RULE};padding:4px 0 4px 16px"><a href="${escapeHtml(f.websiteUrl)}" target="_blank" style="color:${NAVY};font-family:${HEADLINE_FONT};font-size:17px;letter-spacing:.3px;text-decoration:none">${escapeHtml(f.websiteLabel || f.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></td>
      </tr></table>`
    : '';
  const icons = EMAIL_FOOTER_SOCIAL_NETWORKS
    .filter(({ key }) => f.social[key])
    .map(({ key, label }, index) => `<a href="${escapeHtml(f.social[key])}" target="_blank" style="display:inline-block;margin-left:${index ? 8 : 0}px;text-decoration:none"><img src="${escapeHtml(assetUrl(assetBaseUrl, `social-${key}.png`))}" width="32" height="32" alt="${escapeHtml(label)}" style="display:block;border:0"/></a>`)
    .join('');
  const linkRow = website || icons
    ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto 0"><tr>
        ${website ? `<td class="mm-ft-cell" valign="middle" style="padding:0 18px 0 0">${website}</td>` : ''}
        ${icons ? `<td class="mm-ft-cell mm-ft-social" valign="middle" style="${website ? `border-left:1px solid ${RULE};padding:0 0 0 18px` : 'padding:0'};white-space:nowrap">${icons}</td>` : ''}
      </tr></table>`
    : '';

  const divider = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 20px"><tr>
      <td valign="top" style="font-size:0;line-height:0"><div style="height:1px;background:${RULE};font-size:0;line-height:0">&nbsp;</div></td>
      <td valign="top" width="56" style="width:56px;font-size:0;line-height:0"><div style="height:3px;background:${TEAL};font-size:0;line-height:0">&nbsp;</div></td>
      <td valign="top" style="font-size:0;line-height:0"><div style="height:1px;background:${RULE};font-size:0;line-height:0">&nbsp;</div></td>
    </tr></table>`;

  const manage = preferencesUrl && f.manageLabel
    ? `<!--mm-manage--><div style="margin:0 0 10px"><a href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:${TEAL};font-size:15px;text-decoration:underline">${escapeHtml(f.manageLabel)}</a><span style="color:${TEAL};font-size:15px">&nbsp;&nbsp;&rarr;</span></div><!--/mm-manage-->`
    : '';
  const unsubscribe = unsubscribeUrl
    ? ` <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline">${escapeHtml(f.unsubscribeLabel || DEFAULT_EMAIL_FOOTER.unsubscribeLabel)}</a>`
    : '';
  const notice = f.notice || unsubscribe
    ? `<div style="color:${MUTED};font-size:12.5px;line-height:1.65">${escapeHtml(f.notice)}${unsubscribe}</div>`
    : '';
  const copyright = f.copyright
    ? `<div style="margin-top:8px;color:#94a3b8;font-size:12px;line-height:1.6">${escapeHtml(withYear(f.copyright, year))}</div>`
    : '';
  const leaf = f.showLeaf
    ? `background-image:url(${assetUrl(assetBaseUrl, 'footer-leaf.png')});background-repeat:no-repeat;background-position:right top;background-size:112px auto;`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e6ebf0"><tr><td align="center" style="padding:36px 32px 30px;background-color:#fbfcfd;${leaf}text-align:center;font-family:${FONT}">
    ${headline ? `<div class="mm-ft-headline" style="color:${NAVY};font-family:${HEADLINE_FONT};font-size:38px;font-weight:300;letter-spacing:-.5px;line-height:1.15">${headline}</div>` : ''}
    ${linkRow}
    ${divider}
    ${manage}${notice}${copyright}
  </td></tr></table>`;
}

export function renderEmailFooterText({
  footer,
  preferencesUrl = '',
  unsubscribeUrl = '',
  year = new Date().getFullYear(),
} = {}) {
  const f = footer ? normalizeEmailFooter(footer) : activeFooter;
  return [
    [f.headline, f.headlineAccent].filter(Boolean).join(' '),
    f.websiteUrl,
    ...EMAIL_FOOTER_SOCIAL_NETWORKS
      .filter(({ key }) => f.social[key])
      .map(({ key, label }) => `${label}: ${f.social[key]}`),
    preferencesUrl ? `${f.manageLabel}: ${preferencesUrl}` : '',
    unsubscribeUrl ? `${f.unsubscribeLabel}: ${unsubscribeUrl}` : '',
    f.notice,
    withYear(f.copyright, year),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Swap the per-recipient marker for a real link, or drop the manage line when there is none. */
export function applyRecipientFooterLinks(html, { preferencesUrl = '' } = {}) {
  const source = String(html || '');
  if (!source.includes(RECIPIENT_PREFERENCES_MARKER)) return source;
  if (!preferencesUrl) {
    return source.replace(/<!--mm-manage-->[\s\S]*?<!--\/mm-manage-->/g, '');
  }
  return source.split(RECIPIENT_PREFERENCES_MARKER).join(escapeHtml(preferencesUrl));
}
