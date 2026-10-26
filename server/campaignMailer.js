import crypto from "crypto";
import nodemailer from "nodemailer";
import { stripHeaderInjection } from "../shared/emailCampaign.js";
import { parseEmailList } from "../shared/campaignWorkspace.js";

// Campaigns send through the same SMTP account as account, ticket and receipt
// emails (Admin → Settings → Email). index.js supplies the saved settings.
let loadSmtpSettings = async () => ({});
export function setCampaignSmtpSettingsLoader(loader) {
  loadSmtpSettings = loader;
}

export const DEFAULT_HOURLY_LIMIT = 200;
const MAX_HOURLY_LIMIT = 5000;
const MAX_PER_TICK = 32;
// The outbox worker ticks every 20 seconds: 180 ticks an hour.
const TICKS_PER_HOUR = 180;

export function clampHourlyLimit(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 1
    ? Math.min(number, MAX_HOURLY_LIMIT)
    : DEFAULT_HOURLY_LIMIT;
}

export function normalizeSmtpSettings(email = {}) {
  return {
    host: String(email.smtpHost || "").trim(),
    port: Number(email.smtpPort || 587),
    user: String(email.smtpUser || "").trim(),
    password: String(email.smtpPassword || "").trim(),
    fromEmail: String(email.fromEmail || "").trim().toLowerCase(),
  };
}

export async function getCampaignDeliveryConfig(pool) {
  const smtp = normalizeSmtpSettings(await loadSmtpSettings());
  const [[row]] = await pool.query(
    "SELECT live_sends,hourly_limit FROM campaign_delivery_settings WHERE id = ?",
    [1],
  );
  return {
    smtp,
    configured: Boolean(smtp.host && smtp.port),
    live: Boolean(Number(row?.live_sends)),
    hourlyLimit: clampHourlyLimit(row?.hourly_limit ?? DEFAULT_HOURLY_LIMIT),
  };
}

export async function saveCampaignDeliverySettings(
  pool,
  { live, hourlyLimit },
  actorId,
) {
  await pool.query(
    `INSERT INTO campaign_delivery_settings (id,live_sends,hourly_limit,updated_by) VALUES (1,?,?,?)
     ON DUPLICATE KEY UPDATE live_sends=VALUES(live_sends),hourly_limit=VALUES(hourly_limit),updated_by=VALUES(updated_by)`,
    [live ? 1 : 0, clampHourlyLimit(hourlyLimit), actorId || null],
  );
  return getCampaignDeliveryConfig(pool);
}

/** Public view of the delivery settings: never includes the SMTP password. */
export function describeDeliveryConfig(config) {
  return {
    configured: config.configured,
    live: config.live,
    hourly_limit: config.hourlyLimit,
    smtp_host: config.smtp.host,
    smtp_port: config.smtp.port,
    smtp_user: config.smtp.user,
    sender_domains: [...allowedSenderDomains(config.smtp)],
  };
}

/** How many messages this worker tick may send without passing the hourly limit. */
export async function campaignSendAllowance(pool, config) {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS sent FROM email_campaign_recipients WHERE sent_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR",
  );
  const remaining = Math.max(0, config.hourlyLimit - Number(row?.sent || 0));
  const smoothed = Math.max(1, Math.ceil(config.hourlyLimit / TICKS_PER_HOUR));
  return Math.min(MAX_PER_TICK, remaining, smoothed);
}

const domainOf = (email) =>
  String(email || "")
    .split("@")[1]
    ?.trim()
    .toLowerCase() || "";

/** Sender addresses the SMTP account can send as: its login's domain and the configured From domain. */
export function allowedSenderDomains(smtp) {
  return new Set([domainOf(smtp.user), domainOf(smtp.fromEmail)].filter(Boolean));
}

let cachedTransport = null;
let cachedFingerprint = "";
function transportFor(smtp) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${smtp.host}:${smtp.port}:${smtp.user}:${smtp.password}`)
    .digest("hex");
  if (cachedTransport && cachedFingerprint === fingerprint)
    return cachedTransport;
  try {
    cachedTransport?.close();
  } catch {
    /* A stale transport may already be closed. */
  }
  cachedTransport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    pool: true,
    maxConnections: 1,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    ...(smtp.user && smtp.password
      ? { auth: { user: smtp.user, pass: smtp.password } }
      : {}),
  });
  cachedFingerprint = fingerprint;
  return cachedTransport;
}

export async function verifySmtpConnection(config, { transport } = {}) {
  try {
    await (transport || transportFor(config.smtp)).verify();
  } catch (error) {
    throw new Error(
      `Couldn't sign in to the SMTP server ${config.smtp.host}: ${error.message}`,
    );
  }
}

// SMTP has no idempotency, so a failure is only retried when the server
// certainly did not accept the message. Anything else needs human review.
const BEFORE_MESSAGE_COMMANDS = new Set(["CONN", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO"]);
export function classifySmtpError(error = {}) {
  const code = Number(error.responseCode);
  const reason = String(error.response || error.message || "SMTP send failed.").slice(0, 380);
  if (error.code === "EAUTH")
    return { status: "failed", reason: `SMTP login failed: ${reason}`, retryable: false };
  if (code >= 500) return { status: "failed", reason, retryable: false };
  if (code >= 400) return { status: "failed", reason, retryable: true };
  const command = String(error.command || "").toUpperCase();
  if (BEFORE_MESSAGE_COMMANDS.has(command) || command.startsWith("AUTH"))
    return { status: "failed", reason, retryable: true };
  return {
    status: "acceptance_unknown",
    reason: `The SMTP connection was interrupted while sending, so delivery is unconfirmed: ${reason}`,
  };
}

export async function sendSmtpEmail({
  config,
  transport,
  to,
  subject,
  html,
  text,
  fromName,
  fromEmail,
  replyTo,
  headers = {},
  cc = [],
} = {}) {
  if (!config?.configured)
    throw new Error("SMTP is not set up. Update Admin Settings → Email.");
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@"))
    throw new Error("A single recipient email is required.");
  if (recipient.includes(","))
    throw new Error("Campaigns must send to one recipient at a time.");
  const copies = parseEmailList(cc).filter(
    (email) => email !== recipient.toLowerCase(),
  );
  let info;
  try {
    info = await (transport || transportFor(config.smtp)).sendMail({
      from: fromName
        ? { name: stripHeaderInjection(fromName), address: stripHeaderInjection(fromEmail) }
        : stripHeaderInjection(fromEmail),
      to: recipient,
      ...(copies.length ? { cc: copies } : {}),
      replyTo: stripHeaderInjection(replyTo || fromEmail),
      subject: stripHeaderInjection(subject),
      html,
      text,
      headers,
    });
  } catch (error) {
    return classifySmtpError(error);
  }
  const accepted = (info?.accepted || []).map((email) =>
    String(email?.address || email).toLowerCase(),
  );
  if (!accepted.includes(recipient.toLowerCase()))
    return {
      status: "failed",
      reason: String(info?.response || "The SMTP server rejected the recipient."),
      retryable: false,
    };
  return { status: "accepted", providerMessageId: info.messageId || null };
}
