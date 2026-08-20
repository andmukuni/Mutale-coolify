export const SMS_TEMPLATE_MAX_LENGTH = 480;

export const TEMPLATE_CHANNELS = [
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Email' },
];

export const TEMPLATE_PLACEHOLDERS = [
  { key: 'first_name', label: 'Purchaser / recipient first name' },
  { key: 'full_name', label: 'Full name' },
  { key: 'thank_you', label: 'Thank-you line with first name' },
  { key: 'event_title', label: 'Event title' },
  { key: 'ticket_url', label: 'Ticket link' },
  { key: 'join_url', label: 'Guest meeting join link (includes access token)' },
  { key: 'survey_url', label: 'Post-event survey link (includes access token)' },
  { key: 'event_url', label: 'Event page link' },
  { key: 'reference', label: 'Ticket / payment reference' },
  { key: 'verify_url', label: 'Email confirmation link' },
  { key: 'reset_url', label: 'Password reset link' },
  { key: 'access_code', label: 'Guest access code' },
  { key: 'certificate_code', label: 'Certificate ID' },
  { key: 'portal_url', label: 'Ticket portal link' },
  { key: 'calendar_url', label: 'Add to calendar page' },
  { key: 'subject', label: 'Message subject' },
  { key: 'message', label: 'Message body' },
];

export const SAMPLE_TEMPLATE_VARS = {
  first_name: 'Andrew',
  full_name: 'Andrew Mukuni',
  thank_you: 'Thank you, Andrew.',
  event_title: 'Navigating the Hidden Sorrows of Leading',
  ticket_url: 'https://mutalemubanga.org/tickets/REG-DEMO',
  join_url: 'https://mutalemubanga.org/tickets/REG-DEMO/join?token=demo',
  survey_url: 'https://mutalemubanga.org/tickets/REG-DEMO/survey?token=demo',
  event_url: 'https://mutalemubanga.org/events/demo',
  reference: 'REG-DEMO',
  verify_url: 'https://mutalemubanga.org/verify-email?token=demo',
  reset_url: 'https://mutalemubanga.org/account/reset-password?token=demo',
  access_code: '482193',
  certificate_code: 'CERT-DEMO',
  portal_url: 'https://mutalemubanga.org/tickets/REG-DEMO',
  calendar_url: 'https://mutalemubanga.org/events/demo/calendar',
  subject: 'Registration update',
  message: 'We look forward to seeing you.',
};

export const SYSTEM_NOTIFICATION_TEMPLATES = [
  {
    slug: 'ticket',
    channel: 'sms',
    name: 'Entry ticket',
    description: 'Sent with a paid or complimentary event ticket.',
    subject: '',
    body: '{{thank_you}} {{event_title}}. Join with your guest token: {{join_url}}',
  },
  {
    slug: 'ticket',
    channel: 'email',
    name: 'Entry ticket',
    description: 'Email subject and text for the attendee ticket.',
    subject: 'Your entry ticket: {{event_title}}',
    body: 'Hi {{first_name}},\n\nYour entry ticket for "{{event_title}}" is ready.\nView your ticket: {{ticket_url}}\nJoin the meeting with your guest token: {{join_url}}\nShow the QR code at the gate for entry.\nReference: {{reference}}',
  },
  {
    slug: 'ticket_buyer',
    channel: 'sms',
    name: 'Ticket copy (purchaser)',
    description: 'SMS copy sent to the person who bought guest tickets.',
    subject: '',
    body: '{{thank_you}} {{event_title}}. Guest join link: {{join_url}}',
  },
  {
    slug: 'ticket_buyer',
    channel: 'email',
    name: 'Ticket copy (purchaser)',
    description: 'Email copy sent to the purchaser when tickets are issued.',
    subject: 'Ticket copy: {{event_title}}',
    body: 'Hi {{first_name}},\n\nHere is your copy of the entry ticket.\nView ticket online: {{ticket_url}}\nGuest join link: {{join_url}}\nShow the QR code at the gate for entry.\nReference: {{reference}}',
  },
  {
    slug: 'registration',
    channel: 'sms',
    name: 'Registration confirmed',
    description: 'Sent when an event registration is confirmed.',
    subject: '',
    body: 'Registration confirmed: {{event_title}}. Ref: {{reference}} {{join_url}}'
  },
  {
    slug: 'registration',
    channel: 'email',
    name: 'Registration confirmed',
    description: 'Email subject for registration confirmation.',
    subject: 'Registration Confirmed: {{event_title}}',
    body: 'Hi {{first_name}},\n\nYour registration for "{{event_title}}" is confirmed.\nReference: {{reference}}\nView your ticket: {{ticket_url}}\nJoin with your guest token: {{join_url}}'
  },
  {
    slug: 'receipt',
    channel: 'sms',
    name: 'Payment receipt',
    description: 'Sent when a receipt is emailed.',
    subject: '',
    body: 'Receipt: {{event_title}}. Your receipt is ready. Ref: {{reference}}',
  },
  {
    slug: 'receipt',
    channel: 'email',
    name: 'Payment receipt',
    description: 'Email subject for payment receipts.',
    subject: 'Receipt: {{event_title}}',
    body: 'Hi {{first_name}},\n\nThank you for registering for "{{event_title}}".\nYour payment receipt is attached to this email.\nAdd this event to your calendar: {{calendar_url}}\nReference: {{reference}}',
  },
  {
    slug: 'certificate',
    channel: 'sms',
    name: 'Certificate of attendance',
    description: 'Sent when a certificate PDF is issued.',
    subject: '',
    body: 'Your certificate for {{event_title}} is ready. ID: {{certificate_code}} {{portal_url}}',
  },
  {
    slug: 'certificate',
    channel: 'email',
    name: 'Certificate of attendance',
    description: 'Email subject and text for certificates.',
    subject: 'Your certificate: {{event_title}}',
    body: 'Dear {{full_name}},\n\nThank you for attending "{{event_title}}".\nYour certificate of attendance is attached to this email.\nCertificate ID: {{certificate_code}}\nView your ticket portal: {{portal_url}}',
  },
  {
    slug: 'event_starting_soon',
    channel: 'sms',
    name: 'Event starting soon',
    description: 'SMS sent 15 minutes before the event starts.',
    subject: '',
    body: '{{event_title}} starts in 15 minutes. Join: {{join_url}}'
  },
  {
    slug: 'event_starting_soon',
    channel: 'email',
    name: 'Event starting soon',
    description: 'Email sent 15 minutes before the event starts.',
    subject: '{{event_title}} starts in 15 minutes',
    body: 'Hi {{first_name}},\n\n"{{event_title}}" starts in 15 minutes.\nJoin with your guest token: {{join_url}}\nYour ticket: {{ticket_url}}\nEvent page: {{event_url}}'
  },
  {
    slug: 'event_started',
    channel: 'sms',
    name: 'Event started',
    description: 'Sent when a live event starts.',
    subject: '',
    body: '{{event_title}} has started. Join: {{join_url}}'
  },
  {
    slug: 'event_started',
    channel: 'email',
    name: 'Event started',
    description: 'Email when a live event starts.',
    subject: '{{event_title}} has started',
    body: 'Hi {{first_name}},\n\n"{{event_title}}" has started.\nJoin with your guest token: {{join_url}}\nYour ticket: {{ticket_url}}\nEvent page: {{event_url}}'
  },
  {
    slug: 'event_ended',
    channel: 'sms',
    name: 'Event ended',
    description: 'Sent after an event ends.',
    subject: '',
    body: '{{event_title}} has ended. Please share feedback: {{survey_url}}'
  },
  {
    slug: 'event_ended',
    channel: 'email',
    name: 'Event ended',
    description: 'Email after an event ends.',
    subject: 'Thank you for attending {{event_title}}',
    body: 'Hi {{first_name}},\n\n"{{event_title}}" has now ended. Thank you for attending.\nPlease complete this short survey: {{survey_url}}\nYour ticket and any certificates: {{ticket_url}}'
  },
  {
    slug: 'verify_email',
    channel: 'sms',
    name: 'Confirm email',
    description: 'Sent when a new account needs email confirmation.',
    subject: '',
    body: 'Hi {{first_name}}, confirm your Mutale account: {{verify_url}} (expires in 24 hours)',
  },
  {
    slug: 'verify_email',
    channel: 'email',
    name: 'Confirm email',
    description: 'Account confirmation email.',
    subject: 'Confirm your email address',
    body: 'Hi {{first_name}},\n\nThank you for signing up! Please confirm your email address:\n{{verify_url}}\n\nThis link expires in 24 hours.',
  },
  {
    slug: 'password_reset',
    channel: 'sms',
    name: 'Password reset',
    description: 'Sent when someone requests a password reset.',
    subject: '',
    body: 'Hi {{first_name}}, reset your Mutale password: {{reset_url}} (expires in 1 hour)',
  },
  {
    slug: 'password_reset',
    channel: 'email',
    name: 'Password reset',
    description: 'Password reset email.',
    subject: 'Reset your password',
    body: 'Hi {{first_name}},\n\nWe received a request to reset your password.\n{{reset_url}}\n\nThis link expires in 1 hour.',
  },
  {
    slug: 'guest_access_code',
    channel: 'sms',
    name: 'Guest access code',
    description: 'One-time code to open a guest ticket or certificate.',
    subject: '',
    body: 'Your Mutale access code for {{event_title}} is {{access_code}}. It expires in 15 minutes.',
  },
  {
    slug: 'guest_access_code',
    channel: 'email',
    name: 'Guest access code',
    description: 'Email with a guest access code.',
    subject: 'Your access code for {{event_title}}',
    body: 'Your verification code is: {{access_code}}\n\nUse this code on your ticket page. This code expires in 15 minutes.',
  },
  {
    slug: 'contact_reply',
    channel: 'sms',
    name: 'Contact reply',
    description: 'SMS companion when an admin replies to a contact message.',
    subject: '',
    body: 'Mutale: {{subject}}\n{{message}}',
  },
  {
    slug: 'contact_reply',
    channel: 'email',
    name: 'Contact reply',
    description: 'Admin reply to a public contact message.',
    subject: '{{subject}}',
    body: '{{message}}',
  },
];

export function formatFirstNameSentenceCase(fullName = '') {
  const first = String(fullName || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  if (!first) return '';
  const lower = first.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

export function buildThankYouLine(fullName = '') {
  const firstName = formatFirstNameSentenceCase(fullName);
  return firstName ? `Thank you, ${firstName}.` : 'Thank you.';
}

export function buildPersonTemplateVars(fullName = '') {
  const full = String(fullName || '').trim();
  return {
    first_name: formatFirstNameSentenceCase(full),
    full_name: full,
    thank_you: buildThankYouLine(full),
  };
}

export function systemTemplateKey(slug, channel) {
  return `${String(slug || '').trim()}::${String(channel || '').trim()}`;
}

export function getSystemTemplate(slug, channel) {
  const key = systemTemplateKey(slug, channel);
  return SYSTEM_NOTIFICATION_TEMPLATES.find((row) => systemTemplateKey(row.slug, row.channel) === key) || null;
}

export function isSystemTemplate(slug, channel) {
  return Boolean(getSystemTemplate(slug, channel));
}

export function renderTemplate(template = '', vars = {}) {
  return String(template || '')
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const value = vars[key];
      return value == null ? '' : String(value);
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function slugifyTemplate(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function normalizeTemplateChannel(raw = 'sms') {
  return String(raw || '').trim().toLowerCase() === 'email' ? 'email' : 'sms';
}
