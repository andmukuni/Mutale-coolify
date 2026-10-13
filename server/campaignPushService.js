import crypto from "node:crypto";
import { evaluateRecipientEligibility } from "./emailConsentService.js";
import { jsonValue } from "./campaignDirectoryService.js";

export async function enqueueCampaignPush(pool, campaign, recipient) {
  if (!Number(campaign.push_enabled)) return;
  const [tokens] = await pool.query(
    `SELECT t.id FROM campaign_push_tokens t JOIN campaign_contacts c ON c.user_id=t.user_id WHERE c.email_normalized=? AND t.active=1`,
    [recipient.email_normalized],
  );
  for (const token of tokens)
    await pool.query(
      "INSERT IGNORE INTO campaign_push_jobs (id,campaign_id,recipient_id,token_id,status,next_attempt_at) VALUES (?,?,?,?,'queued',UTC_TIMESTAMP())",
      [`push-job-${crypto.randomUUID()}`, campaign.id, recipient.id, token.id],
    );
}
export async function runCampaignPushTick(
  pool,
  { fetchImpl = fetch, accessToken = process.env.EXPO_ACCESS_TOKEN } = {},
) {
  if (!accessToken) return;
  const [jobs] = await pool.query(
    `SELECT j.*,t.token,r.email_normalized,r.contact_json,c.state,c.subject,c.preheader,c.event_id,c.purpose,c.campaign_type FROM campaign_push_jobs j JOIN campaign_push_tokens t ON t.id=j.token_id JOIN email_campaign_recipients r ON r.id=j.recipient_id JOIN email_campaigns c ON c.id=j.campaign_id WHERE j.status='queued' AND j.next_attempt_at<=UTC_TIMESTAMP() AND t.active=1 AND c.state IN ('sending','completed','partially_failed') LIMIT 50`,
  );
  for (const job of jobs) {
    const gate = await evaluateRecipientEligibility(pool, {
      email: job.email_normalized,
      purpose: jsonValue(job.contact_json).effective_purpose || job.purpose,
    });
    if (gate.blocked) {
      await pool.query(
        "UPDATE campaign_push_jobs SET status='skipped',last_error=? WHERE id=?",
        [gate.reason, job.id],
      );
      continue;
    }
    if (job.event_id && job.campaign_type === "event_invitation") {
      const [[invitee]] = await pool.query(
        "SELECT state FROM event_invitees WHERE event_id=? AND email_normalized=?",
        [job.event_id, job.email_normalized],
      );
      if (invitee && ["accepted", "declined"].includes(invitee.state)) {
        await pool.query(
          "UPDATE campaign_push_jobs SET status='skipped',last_error='invitation_responded' WHERE id=?",
          [job.id],
        );
        continue;
      }
    }
    const [claim] = await pool.query(
      "UPDATE campaign_push_jobs SET status='claimed',tries=tries+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND status='queued'",
      [job.id],
    );
    if (!claim.affectedRows) continue;
    try {
      const response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: job.token,
          title: job.subject,
          body: job.preheader || "You have a new campaign update.",
          data: {
            campaign_id: job.campaign_id,
            event_id: job.event_id,
            url: job.event_id ? `/events/${job.event_id}` : "/account",
          },
          sound: "default",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (response.ok && ticket?.status === "ok" && ticket.id)
        await pool.query(
          "UPDATE campaign_push_jobs SET status='accepted',ticket_id=?,accepted_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=?",
          [ticket.id, job.id],
        );
      else if (
        (response.status === 429 || response.status >= 500) &&
        job.tries < 4
      )
        await pool.query(
          "UPDATE campaign_push_jobs SET status='queued',next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),last_error=? WHERE id=?",
          [
            2 ** (job.tries + 1),
            "Push provider temporarily unavailable",
            job.id,
          ],
        );
      else {
        await pool.query(
          "UPDATE campaign_push_jobs SET status='failed',last_error=? WHERE id=?",
          [
            String(
              ticket?.message ||
                result.errors?.[0]?.message ||
                "Push provider rejected notification",
            ).slice(0, 400),
            job.id,
          ],
        );
        if (ticket?.details?.error === "DeviceNotRegistered")
          await pool.query(
            "UPDATE campaign_push_tokens SET active=0 WHERE id=?",
            [job.token_id],
          );
      }
    } catch {
      await pool.query(
        "UPDATE campaign_push_jobs SET status='acceptance_unknown',last_error='Push provider response interrupted' WHERE id=?",
        [job.id],
      );
    }
  }
  const [accepted] = await pool.query(
    "SELECT * FROM campaign_push_jobs WHERE status='accepted' AND accepted_at<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) LIMIT 100",
  );
  if (accepted.length) {
    try {
      const response = await fetchImpl(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: accepted.map((job) => job.ticket_id) }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (response.ok)
        for (const job of accepted) {
          const receipt = result.data?.[job.ticket_id];
          if (receipt) {
            await pool.query(
              "UPDATE campaign_push_jobs SET status=?,last_error=? WHERE id=?",
              [
                receipt.status === "ok" ? "delivered" : "failed",
                receipt.message || null,
                job.id,
              ],
            );
            if (receipt.details?.error === "DeviceNotRegistered")
              await pool.query(
                "UPDATE campaign_push_tokens SET active=0 WHERE id=?",
                [job.token_id],
              );
          } else if (
            new Date(job.accepted_at + "Z").getTime() <
            Date.now() - 86400000
          )
            await pool.query(
              "UPDATE campaign_push_jobs SET status='acceptance_unknown',last_error='Push receipt unavailable after 24 hours' WHERE id=?",
              [job.id],
            );
        }
    } catch {
      /* Receipt queries are read-only and will be repeated on the next tick. */
    }
  }
  await pool.query(
    "UPDATE campaign_push_jobs SET status='acceptance_unknown',last_error='Interrupted push claim' WHERE status='claimed' AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)",
  );
}
