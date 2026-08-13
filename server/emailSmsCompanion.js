import { normalizeZambianSmsPhone } from './ontechSmsClient.js';

export const SMS_MAX_LENGTH = 480;

const SECRET_EMAIL_KINDS = new Set(['auth', 'access_code', 'test']);

export function truncateSms(message = '', maxLength = SMS_MAX_LENGTH) {
  const text = String(message || '').trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return `${clipped}…`;
}

export function buildSmsMessage({ subject, text, smsMessage } = {}) {
  const explicit = String(smsMessage || '').trim();
  if (explicit) return truncateSms(explicit);

  const subj = String(subject || '').trim();
  const body = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncateSms([subj, body].filter(Boolean).join('\n\n'));
}

export function uniqueSmsRecipients(phones = []) {
  const list = Array.isArray(phones) ? phones : [phones];
  const seen = new Set();
  const out = [];
  for (const phone of list) {
    const normalized = normalizeZambianSmsPhone(phone);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function shouldCopyAdminOnEmail({ kind } = {}) {
  const normalized = String(kind || '').trim().toLowerCase();
  return !SECRET_EMAIL_KINDS.has(normalized);
}

export function hasExplicitSmsTo(smsTo) {
  if (Array.isArray(smsTo)) return smsTo.some((value) => String(value || '').trim());
  return Boolean(String(smsTo || '').trim());
}

export function collectEmailSmsRecipients({ settings, smsTo, kind } = {}) {
  const phones = [];
  if (Array.isArray(smsTo)) phones.push(...smsTo);
  else if (smsTo) phones.push(smsTo);
  if (shouldCopyAdminOnEmail({ kind })) {
    phones.push(settings?.notifications?.adminAlertPhone);
  }
  return uniqueSmsRecipients(phones);
}
