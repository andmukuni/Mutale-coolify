// Campaign report totals, recipients and link activity. Delivery goes through
// SMTP, so opens come from the tracking pixel and clicks from link redirects.
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
       SUM(sent_at IS NOT NULL AND opened_at IS NULL) AS not_opened,
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
