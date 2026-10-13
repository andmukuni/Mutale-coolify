import { getResendConfig } from "./emailResendAdapter.js";
import { transaction, jsonValue } from "./campaignDirectoryService.js";
import { refreshCampaignProgress } from "./emailOutboxService.js";
import { replayPendingProviderEvents } from "./emailWebhookService.js";
import { enqueueCampaignPush } from "./campaignPushService.js";
import { getCampaign, writeAudit } from "./emailCampaignService.js";
export async function reconcileCampaignJob(
  pool,
  { campaignId, jobId, providerMessageId, actorId },
  { fetchImpl = fetch, config = getResendConfig() } = {},
) {
  const [[job]] = await pool.query(
    "SELECT * FROM email_outbox_jobs WHERE id=? AND campaign_id=?",
    [jobId, campaignId],
  );
  if (!job || job.status !== "acceptance_unknown")
    throw new Error("Select an ambiguous send to reconcile.");
  if (!config.apiKey) throw new Error("Configure Resend before reconciling.");
  const providerId =
    job.provider_message_id || String(providerMessageId || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(providerId))
    throw new Error("Enter the message ID from the provider log.");
  const response = await fetchImpl(
    `https://api.resend.com/emails/${encodeURIComponent(providerId)}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "Mutale-Campaigns/2.0",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  if (!response.ok || data.id !== providerId)
    throw new Error("Unable to confirm this provider message.");
  const payload = jsonValue(job.payload_json);
  if (
    !Array.isArray(data.to) ||
    !data.to
      .map((email) => email.toLowerCase())
      .includes(payload.to?.toLowerCase()) ||
    data.subject !== payload.subject ||
    data.html !== payload.html ||
    !data.tags?.some(
      (tag) => tag.name === "campaign_id" && tag.value === campaignId,
    )
  )
    throw new Error(
      "Provider message does not match the saved recipient, content and campaign.",
    );
  await transaction(pool, async (connection) => {
    const [[latest]] = await connection.query(
      "SELECT status FROM email_outbox_jobs WHERE id=? FOR UPDATE",
      [jobId],
    );
    if (latest.status !== "acceptance_unknown")
      throw new Error("This message has already been reconciled.");
    await connection.query(
      "UPDATE email_outbox_jobs SET status='sent',provider_message_id=?,last_error=NULL WHERE id=?",
      [providerId, jobId],
    );
    await connection.query(
      "UPDATE email_campaign_recipients SET outcome=IF(sent_at IS NULL,'accepted',outcome),provider_message_id=?,sent_at=COALESCE(sent_at,UTC_TIMESTAMP()),error_reason=NULL WHERE id=?",
      [providerId, job.recipient_id],
    );
    await writeAudit(connection, {
      actorId,
      action: "campaign.reconciled",
      campaignId,
      detail: jobId,
    });
  });
  const campaign = await getCampaign(pool, campaignId);
  const [[recipient]] = await pool.query(
    "SELECT * FROM email_campaign_recipients WHERE id=?",
    [job.recipient_id],
  );
  if (campaign.campaign_type === "event_invitation")
    await pool.query(
      "UPDATE event_invitees SET state=IF(state='not_sent','no_response',state),first_sent_at=COALESCE(first_sent_at,UTC_TIMESTAMP()),last_sent_at=UTC_TIMESTAMP() WHERE event_id=? AND email_normalized=?",
      [campaign.event_id, recipient.email_normalized],
    );
  await enqueueCampaignPush(pool, campaign, recipient);
  await replayPendingProviderEvents(pool, providerId);
  await refreshCampaignProgress(pool, campaignId);
  return { reconciled: true };
}
