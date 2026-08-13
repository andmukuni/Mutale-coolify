/**
 * Ontech Bulk SMS HTTP API client.
 * Endpoint: GET {baseUrl}/httpapi?api_key=&phone=&msg=&sender_id=
 */

export const ONTECH_SMS_BASE_URL = 'https://bulksms.ontech.co.zm/smsservice';

export function normalizeOntechBaseUrl(baseUrl) {
  let url = String(baseUrl || ONTECH_SMS_BASE_URL).trim().replace(/\/+$/, '');

  // The Ontech portal sometimes exposes an `/api` URL, while SMS delivery
  // uses the `/smsservice` root.
  if (/\/api$/i.test(url)) {
    url = url.replace(/\/api$/i, '/smsservice');
  }
  if (!/\/smsservice$/i.test(url) && /bulksms\.ontech\.co\.zm$/i.test(url)) {
    url = `${url}/smsservice`;
  }

  return url;
}

export function assertOntechBaseUrl(baseUrl) {
  const normalized = normalizeOntechBaseUrl(baseUrl);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Ontech API base URL must be a valid URL.');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== 'bulksms.ontech.co.zm'
    || parsed.pathname.replace(/\/+$/, '').toLowerCase() !== '/smsservice'
  ) {
    throw new Error('Ontech API base URL must be https://bulksms.ontech.co.zm/smsservice.');
  }

  return normalized;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
  }
  return fallback;
}

/**
 * Allowlist the Ontech settings shape and discard credentials from retired
 * SMS providers. `defaults` can contain environment-backed Ontech values.
 */
export function normalizeOntechSmsSettings(sms = {}, defaults = {}) {
  const raw = sms && typeof sms === 'object' && !Array.isArray(sms) ? sms : {};
  const isOntech = String(raw.provider || '').trim().toLowerCase() === 'ontech';

  return {
    enabled: isOntech ? toBoolean(raw.enabled, Boolean(defaults.enabled)) : Boolean(defaults.enabled),
    provider: 'ontech',
    baseUrl: normalizeOntechBaseUrl(isOntech ? (raw.baseUrl || raw.base_url) : defaults.baseUrl),
    accessId: String(isOntech ? (raw.accessId || raw.access_id || '') : (defaults.accessId || '')).trim(),
    senderId: String(isOntech ? (raw.senderId || raw.sender_id || '') : (defaults.senderId || '')).trim(),
  };
}

export function validateOntechSmsSettings(settings = {}) {
  const sms = settings?.sms || settings;
  if (String(sms.provider || '').toLowerCase() !== 'ontech') {
    throw new Error('SMS provider must be Ontech.');
  }
  if (sms.senderId && String(sms.senderId).length > 11) {
    throw new Error('Ontech Sender ID must be 11 characters or fewer.');
  }
  assertOntechBaseUrl(sms.baseUrl);
  if (toBoolean(sms.enabled, false) && (!String(sms.accessId || '').trim() || !String(sms.senderId || '').trim())) {
    throw new Error('Ontech API key and Sender ID must be configured before SMS is enabled.');
  }
}

/** Normalize Zambian phone numbers to 260XXXXXXXXX (without a leading +). */
export function normalizeZambianSmsPhone(phone) {
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `260${digits.slice(1)}`;
  }
  if (digits.startsWith('260') && digits.length === 12) return digits;
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Send one SMS through Ontech.
 *
 * @param {{ accessId?: string, access_id?: string, apiKey?: string, senderId?: string, sender_id?: string, baseUrl?: string, base_url?: string }} config
 * @param {{ phone: string, message: string }} payload
 */
export async function sendOntechSms(config = {}, { phone, message } = {}) {
  const apiKey = String(config.accessId || config.access_id || config.apiKey || '').trim();
  const senderId = String(config.senderId || config.sender_id || '').trim();
  const baseUrl = assertOntechBaseUrl(config.baseUrl || config.base_url);
  const normalizedPhone = normalizeZambianSmsPhone(phone);
  const smsMessage = String(message || '').trim();

  if (!apiKey) throw new Error('Ontech API key is required.');
  if (!senderId) throw new Error('Ontech Sender ID is required.');
  if (senderId.length > 11) throw new Error('Ontech Sender ID must be 11 characters or fewer.');
  if (!normalizedPhone) throw new Error('Recipient phone number is required.');
  if (!smsMessage) throw new Error('SMS message is required.');

  const url = new URL(`${baseUrl}/httpapi`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('phone', normalizedPhone);
  url.searchParams.set('msg', smsMessage);
  url.searchParams.set('sender_id', senderId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Ontech SMS API returned HTTP ${response.status}.`);
    }

    const status = Number(data?.status);
    if (Number.isFinite(status) && status !== 100) {
      throw new Error(data?.message || `Ontech SMS failed (status ${status}).`);
    }

    return {
      provider: 'ontech',
      recipient: normalizedPhone,
      messageId: data?.message_id || data?.id || data?.messageId || `ontech-${Date.now()}`,
      raw: data,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Ontech SMS request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
