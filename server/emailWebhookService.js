import { newCampaignId } from "../shared/emailCampaign.js";
import { recordSuppression } from "./emailConsentService.js";
import {
  summarizeProviderEvent,
  verifyResendWebhook,
} from "./emailResendAdapter.js";
import { transaction, jsonValue } from "./campaignDirectoryService.js";

export async function ingestResendWebhook(pool, { rawBody, headers, secret }) {
  verifyResendWebhook({ rawBody, headers, secret });
  const payload = JSON.parse(String(rawBody || "{}"));
  const svixId = String(
    headers["svix-id"] || headers["Svix-Id"] || payload.id || "",
  ).trim();
  if (!svixId) throw new Error("Webhook id is missing.");
  const [[existing]] = await pool.query(
    "SELECT id FROM email_provider_events WHERE svix_id = ? LIMIT 1",
    [svixId],
  );
  if (existing) return { ok: true, duplicate: true };
  const summary = summarizeProviderEvent(payload);
  const id = newCampaignId("eprv");
  try {
    await pool.query(
      "INSERT INTO email_provider_events (id,svix_id,event_type,provider_message_id,payload_json) VALUES (?,?,?,?,?)",
      [
        id,
        svixId,
        summary.type,
        summary.providerMessageId,
        JSON.stringify({
          type: summary.type,
          bounce: payload.data?.bounce || null,
        }),
      ],
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { ok: true, duplicate: true };
    throw error;
  }
  await applyStoredProviderEvent(pool, id);
  return { ok: true, type: summary.type, duplicate: false };
}
async function applyStoredProviderEvent(pool, id) {
  return transaction(pool, async (connection) => {
    const [[event]] = await connection.query(
      "SELECT * FROM email_provider_events WHERE id=? FOR UPDATE",
      [id],
    );
    if (!event || event.processed_at || !event.provider_message_id) return;
    const [[recipient]] = await connection.query(
      "SELECT * FROM email_campaign_recipients WHERE provider_message_id = ? LIMIT 1",
      [event.provider_message_id],
    );
    if (!recipient) return;
    const payload = jsonValue(event.payload_json);
    const type = event.event_type;
    if (type === "email.delivered")
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome=IF(outcome='accepted' OR outcome='pending','delivered',outcome),delivered_at=COALESCE(delivered_at,UTC_TIMESTAMP()) WHERE id=?",
        [recipient.id],
      );
    if (type === "email.bounced") {
      const bounce = payload.bounce || {};
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome='bounced',bounced_at=COALESCE(bounced_at,UTC_TIMESTAMP()),bounce_type=?,error_reason=? WHERE id=?",
        [bounce.type || "Unknown", bounce.message || "bounced", recipient.id],
      );
      await recordSuppression(
        connection,
        recipient.email_normalized,
        bounce.type === "Permanent" ? "hard_bounce" : "soft_bounce",
        "resend",
        { details: bounce.message },
      );
    }
    if (type === "email.complained") {
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome='complained',complained_at=COALESCE(complained_at,UTC_TIMESTAMP()) WHERE id=?",
        [recipient.id],
      );
      await recordSuppression(
        connection,
        recipient.email_normalized,
        "complaint",
        "resend",
      );
    }
    if (type === "email.opened")
      await connection.query(
        "UPDATE email_campaign_recipients SET opened_at=COALESCE(opened_at,UTC_TIMESTAMP()) WHERE id=?",
        [recipient.id],
      );
    if (type === "email.clicked")
      await connection.query(
        "UPDATE email_campaign_recipients SET clicked_at=COALESCE(clicked_at,UTC_TIMESTAMP()) WHERE id=?",
        [recipient.id],
      );
    if (type === "email.failed")
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome='failed',error_reason='provider_failed' WHERE id=?",
        [recipient.id],
      );
    await connection.query(
      "UPDATE email_provider_events SET recipient_id=?,campaign_id=?,processed_at=UTC_TIMESTAMP() WHERE id=?",
      [recipient.id, recipient.campaign_id, id],
    );
  });
}
export async function replayPendingProviderEvents(pool, providerMessageId) {
  const [events] = await pool.query(
    "SELECT id FROM email_provider_events WHERE provider_message_id=? AND processed_at IS NULL ORDER BY created_at",
    [providerMessageId],
  );
  for (const event of events) await applyStoredProviderEvent(pool, event.id);
}
export async function getCampaignReport(pool, campaignId) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS recipients,
       SUM(included = 1) AS included,
       SUM(sent_at IS NOT NULL) AS accepted,
       SUM(delivered_at IS NOT NULL) AS delivered,
       SUM(bounced_at IS NOT NULL) AS bounced,
       SUM(outcome = 'complained') AS complained,
       SUM(outcome = 'failed') AS failed,
       SUM(outcome = 'skipped') AS skipped,
       SUM(included=0 AND exclude_reason IN ('hard_bounce','complaint','unsubscribed','no_marketing_consent')) AS suppressed,
       SUM(bounced_at IS NOT NULL AND bounce_type='Transient') AS soft_bounced,SUM(bounced_at IS NOT NULL AND bounce_type='Permanent') AS hard_bounced,SUM(bounced_at IS NOT NULL AND (bounce_type IS NULL OR bounce_type NOT IN ('Transient','Permanent'))) AS other_bounced,
       SUM(opened_at IS NOT NULL) AS opened,
       SUM(clicked_at IS NOT NULL) AS clicked,
       SUM(unsubscribed_at IS NOT NULL) AS unsubscribed,
       SUM(delivered_at IS NOT NULL AND opened_at IS NULL) AS not_opened,
       SUM(opened_at IS NOT NULL AND clicked_at IS NULL) AS not_clicked,
       SUM(outcome='acceptance_unknown') AS acceptance_unknown,
       SUM(included=0) AS excluded
     FROM email_campaign_recipients
     WHERE campaign_id = ?`,
    [campaignId],
  );
  const [rows] = await pool.query(
    `SELECT id, email_normalized, display_name, included, exclude_reason, outcome,
            sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at, error_reason,contact_id,contact_json,COALESCE(bounced_at,complained_at,delivered_at,sent_at,created_at) AS status_date,
            (SELECT COUNT(*) FROM email_campaign_link_events ce WHERE ce.recipient_id=email_campaign_recipients.id) AS clicks
     FROM email_campaign_recipients
     WHERE campaign_id = ?
     ORDER BY included DESC, email_normalized ASC`,
    [campaignId],
  );
  return {
    totals: {
      ...Object.fromEntries(
        Object.entries(totals || {}).map(([key, value]) => [
          key,
          Number(value || 0),
        ]),
      ),
      opens_are_estimates: true,
      clicks_are_estimates: true,
    },
    recipients: (rows || []).map((row) => {
      let contact = {};
      try {
        contact =
          row.contact_json && typeof row.contact_json === "object"
            ? row.contact_json
            : JSON.parse(row.contact_json || "{}");
      } catch {
        /* Legacy exclusions have no contact snapshot. */
      }
      const names = String(row.display_name || "").split(/\s+/);
      return {
        ...row,
        contact_json: undefined,
        first_name: contact.first_name || names[0] || "",
        last_name: contact.last_name || names.slice(1).join(" "),
        active_member: Boolean(Number(contact.active_member)),
      };
    }),
    links: await campaignLinkReport(pool, campaignId),
  };
}

export async function campaignLinkReport(pool, id) {
  const [links] = await pool.query(
    `SELECT l.id,l.label,l.destination,l.category,COUNT(e.id) AS clicks,COUNT(DISTINCT e.recipient_id) AS unique_clicks
    FROM email_campaign_links l LEFT JOIN email_campaign_link_events e ON e.link_id=l.id WHERE l.campaign_id=? GROUP BY l.id ORDER BY clicks DESC,l.created_at`,
    [id],
  );
  return links;
}
