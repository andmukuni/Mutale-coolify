import {
  MARKETING_CONSENT_VERSION,
  MARKETING_CONSENT_WORDING,
  normalizeCampaignEmail,
} from "../shared/emailCampaign.js";
import { newCampaignId } from "../shared/emailCampaign.js";

export function isPromotionalBlocked(preference, suppressions = []) {
  if (preference?.unsubscribed_at)
    return { blocked: true, reason: "unsubscribed" };
  if (
    preference?.marketing_opt_in !== 1 &&
    preference?.marketing_opt_in !== true
  ) {
    return { blocked: true, reason: "no_marketing_consent" };
  }
  const suppression = suppressions.find(
    (row) => row.reason === "hard_bounce" || row.reason === "complaint",
  );
  if (suppression) {
    return { blocked: true, reason: suppression.reason };
  }
  return { blocked: false, reason: null };
}

export function isServiceBlocked(suppressions = []) {
  if (suppressions.some((row) => row.reason === "hard_bounce")) {
    return { blocked: true, reason: "hard_bounce" };
  }
  return { blocked: false, reason: null };
}

export async function getEmailPreference(pool, email) {
  const normalized = normalizeCampaignEmail(email);
  if (!normalized) return null;
  const [[row]] = await pool.query(
    "SELECT * FROM email_preferences WHERE email_normalized = ? LIMIT 1",
    [normalized],
  );
  return row || null;
}

export async function listSuppressions(pool, email) {
  const normalized = normalizeCampaignEmail(email);
  if (!normalized) return [];
  const [rows] = await pool.query(
    "SELECT * FROM email_suppressions WHERE email_normalized = ?",
    [normalized],
  );
  return rows || [];
}

export async function recordMarketingOptIn(
  pool,
  email,
  { source = "registration" } = {},
) {
  const normalized = normalizeCampaignEmail(email);
  if (!normalized) return null;
  await pool.query(
    `INSERT INTO email_preferences
      (email_normalized, marketing_opt_in, marketing_opt_in_at, marketing_source, marketing_wording_version)
     VALUES (?, 1, UTC_TIMESTAMP(), ?, ?)
     ON DUPLICATE KEY UPDATE
       marketing_opt_in = 1,
       marketing_opt_in_at = UTC_TIMESTAMP(),
       marketing_source = VALUES(marketing_source),
       marketing_wording_version = VALUES(marketing_wording_version),
       unsubscribed_at = NULL`,
    [normalized, source, MARKETING_CONSENT_VERSION],
  );
  await pool.query(
    "DELETE FROM email_suppressions WHERE email_normalized = ? AND reason = 'unsubscribe'",
    [normalized],
  );
  return getEmailPreference(pool, normalized);
}

export async function recordUnsubscribe(
  pool,
  email,
  { source = "one_click", reason = "", details = "" } = {},
) {
  const normalized = normalizeCampaignEmail(email);
  if (!normalized) throw new Error("Email is required.");
  await pool.query(
    `INSERT INTO email_preferences (email_normalized, unsubscribed_at)
     VALUES (?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE unsubscribed_at = UTC_TIMESTAMP()`,
    [normalized],
  );
  await pool.query(
    `INSERT INTO email_suppressions (email_normalized, reason, source)
     VALUES (?, 'unsubscribe', ?)
     ON DUPLICATE KEY UPDATE source = VALUES(source)`,
    [normalized, source],
  );
  await pool.query(
    "UPDATE email_preferences SET unsubscribe_reason=?,unsubscribe_details=?,unsubscribe_source=? WHERE email_normalized=?",
    [
      String(reason || "").slice(0, 255),
      String(details || "").slice(0, 2000),
      source,
      normalized,
    ],
  );
  await pool.query(
    "UPDATE email_campaign_recipients SET unsubscribed_at=COALESCE(unsubscribed_at,UTC_TIMESTAMP()) WHERE email_normalized=?",
    [normalized],
  );
  return getEmailPreference(pool, normalized);
}

export async function recordSuppression(
  pool,
  email,
  reason,
  source = "provider",
  { details = "" } = {},
) {
  const normalized = normalizeCampaignEmail(email);
  if (!normalized || !reason) return;
  await pool.query(
    `INSERT INTO email_suppressions (email_normalized, reason, source)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE source = VALUES(source)`,
    [normalized, reason, source],
  );
  if (details) {
    let bounceReason = "Other";
    const text = String(details).toLowerCase();
    if (/5\.1\.1|mailbox.*(not found|does not exist)|user unknown/.test(text))
      bounceReason = "Bad Mail Box";
    else if (/domain.*(invalid|not found)|5\.1\.2/.test(text))
      bounceReason = "Bad Domain";
    else if (/spam/.test(text)) bounceReason = "Spam Related";
    else if (/policy|blocked/.test(text)) bounceReason = "Policy Related";
    else if (/connect|timeout/.test(text)) bounceReason = "Bad Connection";
    await pool.query(
      "UPDATE email_suppressions SET bounce_reason=?,bounce_details=?,last_bounced_at=UTC_TIMESTAMP() WHERE email_normalized=? AND reason=?",
      [bounceReason, String(details).slice(0, 2000), normalized, reason],
    );
  }
}

export async function evaluateRecipientEligibility(pool, { email, purpose }) {
  const preference = await getEmailPreference(pool, email);
  const suppressions = await listSuppressions(pool, email);
  if (purpose === "promotional")
    return {
      preference,
      suppressions,
      ...isPromotionalBlocked(preference, suppressions),
    };
  return { preference, suppressions, ...isServiceBlocked(suppressions) };
}

export function marketingConsentCopy() {
  return {
    version: MARKETING_CONSENT_VERSION,
    wording: MARKETING_CONSENT_WORDING,
  };
}

export function newConsentId() {
  return newCampaignId("ecns");
}
