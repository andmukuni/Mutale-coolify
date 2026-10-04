import { newCampaignId } from '../shared/emailCampaign.js';
import { recordSuppression } from './emailConsentService.js';
import { summarizeProviderEvent, verifyResendWebhook } from './emailResendAdapter.js';

export async function ingestResendWebhook(pool, { rawBody, headers, secret }) {
  verifyResendWebhook({ rawBody, headers, secret });
  const payload = JSON.parse(String(rawBody || '{}'));
  const svixId = String(headers['svix-id'] || headers['Svix-Id'] || payload.id || '').trim();
  if (!svixId) throw new Error('Webhook id is missing.');

  const [[existing]] = await pool.query('SELECT id FROM email_provider_events WHERE svix_id = ? LIMIT 1', [svixId]);
  if (existing) return { ok: true, duplicate: true };

  const summary = summarizeProviderEvent(payload);
  const [[recipient]] = summary.providerMessageId
    ? await pool.query(
      'SELECT * FROM email_campaign_recipients WHERE provider_message_id = ? LIMIT 1',
      [summary.providerMessageId],
    )
    : [[]];

  await pool.query(
    `INSERT INTO email_provider_events
      (id, svix_id, event_type, provider_message_id, campaign_id, recipient_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      newCampaignId('eprv'),
      svixId,
      summary.type,
      summary.providerMessageId,
      recipient?.campaign_id || null,
      recipient?.id || null,
      JSON.stringify({ type: payload.type, email_id: summary.providerMessageId, bounce: payload.data?.bounce || null }),
    ],
  );

  if (recipient) {
    if (summary.type === 'email.delivered') {
      await pool.query(
        `UPDATE email_campaign_recipients SET outcome = IF(outcome = 'accepted' OR outcome = 'pending', 'delivered', outcome), delivered_at = COALESCE(delivered_at, NOW()) WHERE id = ?`,
        [recipient.id],
      );
    }
    if (summary.type === 'email.bounced') {
      await pool.query(
        `UPDATE email_campaign_recipients SET outcome = 'bounced', bounced_at = NOW(), error_reason = ? WHERE id = ?`,
        [summary.bounceMessage || 'bounced', recipient.id],
      );
      if (String(summary.bounceType || '') === 'Permanent') {
        await recordSuppression(pool, recipient.email_normalized, 'hard_bounce', 'resend');
      }
    }
    if (summary.type === 'email.complained') {
      await pool.query(
        `UPDATE email_campaign_recipients SET outcome = 'complained', complained_at = NOW() WHERE id = ?`,
        [recipient.id],
      );
      await recordSuppression(pool, recipient.email_normalized, 'complaint', 'resend');
    }
    if (summary.type === 'email.opened') {
      await pool.query(
        'UPDATE email_campaign_recipients SET opened_at = COALESCE(opened_at, NOW()) WHERE id = ?',
        [recipient.id],
      );
    }
    if (summary.type === 'email.clicked') {
      await pool.query(
        'UPDATE email_campaign_recipients SET clicked_at = COALESCE(clicked_at, NOW()) WHERE id = ?',
        [recipient.id],
      );
    }
    if (summary.type === 'email.failed') {
      await pool.query(
        `UPDATE email_campaign_recipients SET outcome = 'failed', error_reason = 'provider_failed' WHERE id = ?`,
        [recipient.id],
      );
    }
  }

  return { ok: true, type: summary.type, duplicate: false };
}

export async function getCampaignReport(pool, campaignId) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS recipients,
       SUM(included = 1) AS included,
       SUM(outcome = 'accepted') AS accepted,
       SUM(outcome = 'delivered') AS delivered,
       SUM(outcome = 'bounced') AS bounced,
       SUM(outcome = 'complained') AS complained,
       SUM(outcome = 'failed') AS failed,
       SUM(outcome = 'skipped') AS skipped,
       SUM(opened_at IS NOT NULL) AS opened,
       SUM(clicked_at IS NOT NULL) AS clicked,
       SUM(unsubscribed_at IS NOT NULL) AS unsubscribed
     FROM email_campaign_recipients
     WHERE campaign_id = ?`,
    [campaignId],
  );
  const [rows] = await pool.query(
    `SELECT id, email_normalized, display_name, included, exclude_reason, outcome,
            sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at, error_reason
     FROM email_campaign_recipients
     WHERE campaign_id = ?
     ORDER BY included DESC, email_normalized ASC`,
    [campaignId],
  );
  return {
    totals: {
      ...totals,
      opens_are_estimates: true,
      clicks_are_estimates: true,
    },
    recipients: rows || [],
  };
}
