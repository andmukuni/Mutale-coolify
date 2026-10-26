import { transaction } from "./campaignDirectoryService.js";
import { refreshCampaignProgress } from "./emailOutboxService.js";
import { enqueueCampaignPush } from "./campaignPushService.js";
import { getCampaign, writeAudit } from "./emailCampaignService.js";

/**
 * Settles a send whose SMTP result is unknown. SMTP keeps no message log the
 * app can query, so an admin decides: "sent" records it as delivered to the
 * mail server; "resend" queues it again, which may produce a duplicate.
 */
export async function reconcileCampaignJob(
  pool,
  { campaignId, jobId, resolution, actorId },
) {
  if (!["sent", "resend"].includes(resolution))
    throw new Error("Choose whether the message was sent or should be sent again.");
  const [[job]] = await pool.query(
    "SELECT * FROM email_outbox_jobs WHERE id=? AND campaign_id=?",
    [jobId, campaignId],
  );
  if (!job || job.status !== "acceptance_unknown")
    throw new Error("Select an unconfirmed send to resolve.");
  await transaction(pool, async (connection) => {
    const [[latest]] = await connection.query(
      "SELECT status FROM email_outbox_jobs WHERE id=? FOR UPDATE",
      [jobId],
    );
    if (latest.status !== "acceptance_unknown")
      throw new Error("This send has already been resolved.");
    if (resolution === "sent") {
      await connection.query(
        "UPDATE email_outbox_jobs SET status='sent',last_error=NULL WHERE id=?",
        [jobId],
      );
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome=IF(sent_at IS NULL,'accepted',outcome),sent_at=COALESCE(sent_at,UTC_TIMESTAMP()),error_reason=NULL WHERE id=?",
        [job.recipient_id],
      );
    } else {
      await connection.query(
        "UPDATE email_outbox_jobs SET status='queued',scheduled_at_utc=UTC_TIMESTAMP(),claimed_at=NULL,last_error=NULL WHERE id=?",
        [jobId],
      );
      await connection.query(
        "UPDATE email_campaign_recipients SET outcome='pending',error_reason=NULL WHERE id=?",
        [job.recipient_id],
      );
    }
    await writeAudit(connection, {
      actorId,
      action: resolution === "sent" ? "campaign.reconciled" : "campaign.resend_queued",
      campaignId,
      detail: jobId,
    });
  });
  if (resolution === "sent") {
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
  }
  await refreshCampaignProgress(pool, campaignId);
  return { reconciled: true, resolution };
}
