import { DEFAULT_CAMPAIGN_SENDER } from "../shared/emailCampaign.js";

async function addColumns(pool, table, definitions) {
  const [columns] = await pool.query(`SHOW COLUMNS FROM ${table}`);
  const existing = new Set(columns.map((column) => column.Field));
  for (const [name, definition] of Object.entries(definitions)) {
    if (!existing.has(name))
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

export async function ensureCampaignWorkspaceSchema(pool) {
  await addColumns(pool, "events", { campaign_content_json: "LONGTEXT NULL" });
  await addColumns(pool, "email_campaigns", {
    campaign_type: "VARCHAR(40) NOT NULL DEFAULT 'event_notification'",
    language: "VARCHAR(30) NOT NULL DEFAULT 'English'",
    template_id: "VARCHAR(90) NULL",
    layout_key: "VARCHAR(40) NOT NULL DEFAULT 'empty'",
    audience_spec_json: "LONGTEXT NULL",
    sender_identity_id: "VARCHAR(90) NULL",
    cc_json: "LONGTEXT NULL",
    cc_assistant: "TINYINT(1) NOT NULL DEFAULT 0",
    scheduled_at_utc: "DATETIME NULL",
    schedule_wall_time: "VARCHAR(30) NULL",
    scheduled_by: "VARCHAR(90) NULL",
    sent_by: "VARCHAR(90) NULL",
    send_started_at: "DATETIME NULL",
    completed_at: "DATETIME NULL",
    audience_frozen_at: "DATETIME NULL",
    archived_at: "DATETIME NULL",
    version: "INT NOT NULL DEFAULT 1",
    audience_preview_count: "INT NULL",
    push_enabled: "TINYINT(1) NOT NULL DEFAULT 0",
  });
  const [campaignColumns] = await pool.query(
    "SHOW COLUMNS FROM email_campaigns",
  );
  if (
    campaignColumns.find((column) => column.Field === "event_id")?.Null === "NO"
  )
    await pool.query(
      "ALTER TABLE email_campaigns MODIFY event_id VARCHAR(80) NULL",
    );
  await addColumns(pool, "email_campaign_recipients", {
    contact_id: "VARCHAR(90) NULL",
    contact_json: "LONGTEXT NULL",
    invitation_id: "VARCHAR(90) NULL",
  });
  const [recipientColumns] = await pool.query(
    "SHOW COLUMNS FROM email_campaign_recipients",
  );
  if(recipientColumns.find(column=>column.Field==='display_name')?.Type==='varchar(180)')await pool.query('ALTER TABLE email_campaign_recipients MODIFY display_name VARCHAR(255) NULL');
  if (
    recipientColumns.find((column) => column.Field === "event_id")?.Null ===
    "NO"
  )
    await pool.query(
      "ALTER TABLE email_campaign_recipients MODIFY event_id VARCHAR(80) NULL",
    );
  await addColumns(pool, "email_outbox_jobs", {
    scheduled_at_utc: "DATETIME NULL",
    revision_id: "VARCHAR(90) NULL",
    copied_json: "LONGTEXT NULL",
    payload_json: "LONGTEXT NULL",
    first_attempt_at_utc: "DATETIME NULL",
  });
  await addColumns(pool, "email_suppressions", {
    bounce_reason: "VARCHAR(100) NULL",
    bounce_details: "TEXT NULL",
    last_bounced_at: "DATETIME NULL",
  });
  await addColumns(pool, "email_campaign_recipients", {
    bounce_type: "VARCHAR(40) NULL",
  });
  await addColumns(pool, "email_provider_events", {
    processed_at: "DATETIME NULL",
  });
  await addColumns(pool, "email_preferences", {
    unsubscribe_reason: "VARCHAR(255) NULL",
    unsubscribe_details: "TEXT NULL",
    unsubscribe_source: "VARCHAR(80) NULL",
  });
  await addColumns(pool, "email_design_templates", {
    campaign_type: "VARCHAR(40) NOT NULL DEFAULT 'event_notification'",
    description: "TEXT NULL",
    layout_key: "VARCHAR(40) NOT NULL DEFAULT 'empty'",
    archived_at: "DATETIME NULL",
  });

  const definitions = {
    campaign_contacts: `id VARCHAR(90) PRIMARY KEY, email_normalized VARCHAR(255) NOT NULL UNIQUE, full_name VARCHAR(255) NOT NULL DEFAULT '', first_name VARCHAR(120) NOT NULL DEFAULT '', last_name VARCHAR(120) NOT NULL DEFAULT '', phone VARCHAR(80) DEFAULT '', company VARCHAR(255) DEFAULT '', title VARCHAR(255) DEFAULT '', assistant_email VARCHAR(255) DEFAULT '', address VARCHAR(500) DEFAULT '', country VARCHAR(100) DEFAULT '', region VARCHAR(100) DEFAULT '', city VARCHAR(100) DEFAULT '', postal_code VARCHAR(60) DEFAULT '', user_id VARCHAR(90) NULL, source VARCHAR(40) DEFAULT 'manual', archived_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    campaign_groups: `id VARCHAR(90) PRIMARY KEY, kind VARCHAR(40) NOT NULL, name VARCHAR(180) NOT NULL, description TEXT, filters_json LONGTEXT, is_private TINYINT DEFAULT 0, active_only TINYINT DEFAULT 0, auto_attendees TINYINT DEFAULT 0, auto_members TINYINT DEFAULT 0, auto_users TINYINT DEFAULT 0, archived_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_campaign_groups_kind(kind)`,
    campaign_group_members: `group_id VARCHAR(90) NOT NULL, contact_id VARCHAR(90) NOT NULL, state VARCHAR(30) DEFAULT 'active', consent_source VARCHAR(100) NULL, consent_at DATETIME NULL, unsubscribed_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id, contact_id)`,
    campaign_memberships: `id VARCHAR(90) PRIMARY KEY, contact_id VARCHAR(90) NOT NULL, type_id VARCHAR(90) NOT NULL, status VARCHAR(30) DEFAULT 'active', starts_at DATE NULL, expires_at DATE NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_campaign_membership(contact_id,type_id)`,
    campaign_sender_identities: `id VARCHAR(90) PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, reply_to VARCHAR(255) NOT NULL, status VARCHAR(40) DEFAULT 'unverified', provider_domain_id VARCHAR(90) NULL, checked_at DATETIME NULL, archived_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    campaign_send_requests: `request_key VARCHAR(100) PRIMARY KEY, campaign_id VARCHAR(90) NOT NULL, revision_id VARCHAR(90) NOT NULL, actor_id VARCHAR(90) NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_campaign_send_once(campaign_id)`,
    event_invitees: `id VARCHAR(90) PRIMARY KEY, event_id VARCHAR(80) NOT NULL, email_normalized VARCHAR(255) NOT NULL, contact_id VARCHAR(90) NULL, display_name VARCHAR(255) DEFAULT '', state VARCHAR(30) DEFAULT 'not_sent', first_sent_at DATETIME NULL, last_sent_at DATETIME NULL, responded_at DATETIME NULL, registration_id VARCHAR(90) NULL, token_hash VARCHAR(64) NULL, token_expires_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_event_invitee(event_id,email_normalized)`,
    event_invitation_responses: `id VARCHAR(90) PRIMARY KEY, invitee_id VARCHAR(90) NOT NULL, response VARCHAR(30) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    email_campaign_links: `id VARCHAR(90) PRIMARY KEY, campaign_id VARCHAR(90) NOT NULL, revision_id VARCHAR(90) NOT NULL, url_hash VARCHAR(64) NOT NULL, label VARCHAR(255) NOT NULL DEFAULT '', destination TEXT NOT NULL, category VARCHAR(40) DEFAULT 'content', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_campaign_link(campaign_id,revision_id,url_hash)`,
    email_campaign_link_targets: `link_id VARCHAR(90) NOT NULL,recipient_id VARCHAR(90) NOT NULL,destination TEXT NOT NULL,PRIMARY KEY(link_id,recipient_id)`,
    email_campaign_link_events: `id VARCHAR(90) PRIMARY KEY, campaign_id VARCHAR(90) NOT NULL, recipient_id VARCHAR(90) NOT NULL, link_id VARCHAR(90) NOT NULL, event_key VARCHAR(160) NOT NULL UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_campaign_link_event(campaign_id,link_id)`,
    campaign_surveys: `id VARCHAR(90) PRIMARY KEY, name VARCHAR(180) NOT NULL, description TEXT, questions_json LONGTEXT NOT NULL, state VARCHAR(30) DEFAULT 'draft', created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    campaign_survey_responses: `id VARCHAR(90) PRIMARY KEY, survey_id VARCHAR(90) NOT NULL, email_normalized VARCHAR(255) NULL, answers_json LONGTEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    campaign_assets: `id VARCHAR(90) PRIMARY KEY,name VARCHAR(255) NOT NULL,url TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    campaign_push_jobs: `id VARCHAR(90) PRIMARY KEY,campaign_id VARCHAR(90) NOT NULL,recipient_id VARCHAR(90) NOT NULL,token_id VARCHAR(90) NOT NULL,status VARCHAR(40) NOT NULL DEFAULT 'queued',tries INT NOT NULL DEFAULT 0,ticket_id VARCHAR(160) NULL,last_error VARCHAR(400) NULL,accepted_at DATETIME NULL,next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_campaign_push_recipient(campaign_id,recipient_id,token_id)`,
    campaign_push_tokens: `id VARCHAR(90) PRIMARY KEY, user_id VARCHAR(90) NOT NULL, token VARCHAR(255) NOT NULL UNIQUE, active TINYINT DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  };
  for (const [table, definition] of Object.entries(definitions))
    await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (${definition})`);
  await pool.query(
    `UPDATE email_campaigns SET audience_spec_json='{"version":2,"include":[{"source":"event_registrants","filter":"advanced"}],"exclude":[]}' WHERE audience_spec_json IS NULL AND event_id IS NOT NULL`,
  );
  await pool.query(
    `UPDATE email_campaigns c SET audience_frozen_at=c.created_at WHERE c.audience_frozen_at IS NULL AND c.state<>'draft' AND EXISTS(SELECT 1 FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.included=1)`,
  );
  await pool.query(
    `INSERT INTO campaign_sender_identities (id,name,email,reply_to) VALUES ('sender-mutale',?,?,?) ON DUPLICATE KEY UPDATE id=id`,
    [
      DEFAULT_CAMPAIGN_SENDER.fromName,
      DEFAULT_CAMPAIGN_SENDER.fromEmail,
      DEFAULT_CAMPAIGN_SENDER.replyTo,
    ],
  );
}
