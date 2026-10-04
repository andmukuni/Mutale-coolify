import crypto from 'crypto';
import { stripHeaderInjection } from '../shared/emailCampaign.js';

const RESEND_API = 'https://api.resend.com/emails';

export function isCampaignLiveSendAllowed() {
  return String(process.env.RESEND_LIVE_SENDS || '').trim() === '1';
}

export function getResendConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    webhookSecret: String(env.RESEND_WEBHOOK_SECRET || '').trim(),
    live: String(env.RESEND_LIVE_SENDS || '').trim() === '1',
  };
}

export function verifyResendWebhook({ rawBody, headers = {}, secret }) {
  const configured = String(secret || '').trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'test' || process.env.RESEND_WEBHOOK_SKIP_VERIFY === '1') return true;
    throw new Error('Webhook secret is not configured.');
  }
  const id = String(headers['svix-id'] || headers['Svix-Id'] || '').trim();
  const timestamp = String(headers['svix-timestamp'] || headers['Svix-Timestamp'] || '').trim();
  const signature = String(headers['svix-signature'] || headers['Svix-Signature'] || '').trim();
  if (!id || !timestamp || !signature) throw new Error('Missing webhook signature headers.');

  const keyB64 = configured.replace(/^whsec_/, '');
  const key = Buffer.from(keyB64, 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${String(rawBody || '')}`)
    .digest('base64');
  const candidates = signature.split(' ').map((part) => part.replace(/^v1,/, '').trim()).filter(Boolean);
  const ok = candidates.some((item) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(item), Buffer.from(expected));
    } catch {
      return false;
    }
  });
  if (!ok) throw new Error('Invalid webhook signature.');
  return true;
}

export async function sendResendEmail({
  config = getResendConfig(),
  fetchImpl = fetch,
  to,
  subject,
  html,
  text,
  fromName,
  fromEmail,
  replyTo,
  headers = {},
  idempotencyKey,
  tags = {},
} = {}) {
  if (!config.apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  const recipient = String(to || '').trim();
  if (!recipient || !recipient.includes('@')) throw new Error('A single recipient email is required.');
  if (recipient.includes(',')) throw new Error('Campaigns must send to one recipient at a time.');

  const payload = {
    from: fromName ? `${stripHeaderInjection(fromName)} <${stripHeaderInjection(fromEmail)}>` : stripHeaderInjection(fromEmail),
    to: [recipient],
    subject: stripHeaderInjection(subject),
    html,
    text,
    reply_to: stripHeaderInjection(replyTo || fromEmail),
    headers,
    tags: Object.entries(tags).map(([name, value]) => ({ name, value: String(value) })),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetchImpl(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey).slice(0, 256) } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { status: 'acceptance_unknown', reason: 'Provider timed out before acceptance was confirmed.' };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return { status: 'accepted', providerMessageId: body?.id || null, duplicate: true };
  }
  if (!response.ok) {
    return { status: 'failed', reason: body?.message || `Resend rejected the send (${response.status}).` };
  }
  return { status: 'accepted', providerMessageId: body?.id || null };
}

export function summarizeProviderEvent(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  return {
    type: String(payload.type || ''),
    providerMessageId: data.email_id || data.id || null,
    bounceType: data.bounce?.type || null,
    bounceMessage: data.bounce?.message || null,
  };
}
