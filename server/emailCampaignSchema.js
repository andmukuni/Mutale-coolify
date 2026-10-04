import { EMAIL_DESIGN_TEMPLATE_SEED } from '../shared/emailDesignTemplates.js';

export async function ensureEmailCommunicationsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(80) NOT NULL,
      name VARCHAR(180) NOT NULL,
      purpose VARCHAR(40) NOT NULL DEFAULT 'event_service',
      state VARCHAR(40) NOT NULL DEFAULT 'draft',
      subject VARCHAR(250) NOT NULL DEFAULT '',
      preheader VARCHAR(250) NOT NULL DEFAULT '',
      from_name VARCHAR(160) NOT NULL DEFAULT 'Mutale Mubanga',
      from_email VARCHAR(255) NOT NULL DEFAULT 'grow@mutalemubanga.org',
      reply_to VARCHAR(255) NOT NULL DEFAULT 'grow@mutalemubanga.org',
      segment_json LONGTEXT,
      scheduled_at DATETIME NULL,
      timezone VARCHAR(80) DEFAULT 'Africa/Lusaka',
      current_revision_id VARCHAR(90) NULL,
      parent_campaign_id VARCHAR(90) NULL,
      created_by VARCHAR(90) NULL,
      live_confirmed_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email_campaigns_event (event_id),
      INDEX idx_email_campaigns_state (state),
      INDEX idx_email_campaigns_scheduled (scheduled_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_campaign_revisions (
      id VARCHAR(90) PRIMARY KEY,
      campaign_id VARCHAR(90) NOT NULL,
      design_json LONGTEXT NOT NULL,
      html_body LONGTEXT NOT NULL,
      text_body LONGTEXT NOT NULL,
      subject VARCHAR(250) NOT NULL DEFAULT '',
      preheader VARCHAR(250) NOT NULL DEFAULT '',
      immutable TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_revisions_campaign (campaign_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_campaign_recipients (
      id VARCHAR(90) PRIMARY KEY,
      campaign_id VARCHAR(90) NOT NULL,
      registration_id VARCHAR(90) NULL,
      event_id VARCHAR(80) NOT NULL,
      email_normalized VARCHAR(255) NOT NULL,
      display_name VARCHAR(180) NULL,
      included TINYINT(1) NOT NULL DEFAULT 1,
      exclude_reason VARCHAR(180) NULL,
      outcome VARCHAR(40) NOT NULL DEFAULT 'pending',
      provider_message_id VARCHAR(160) NULL,
      sent_at DATETIME NULL,
      delivered_at DATETIME NULL,
      bounced_at DATETIME NULL,
      complained_at DATETIME NULL,
      opened_at DATETIME NULL,
      clicked_at DATETIME NULL,
      unsubscribed_at DATETIME NULL,
      error_reason VARCHAR(400) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email_campaign_recipient (campaign_id, email_normalized),
      INDEX idx_email_recipients_event (event_id),
      INDEX idx_email_recipients_outcome (outcome)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_outbox_jobs (
      id VARCHAR(90) PRIMARY KEY,
      campaign_id VARCHAR(90) NOT NULL,
      recipient_id VARCHAR(90) NOT NULL,
      registration_id VARCHAR(90) NULL,
      attempt_key VARCHAR(120) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'queued',
      scheduled_at DATETIME NOT NULL,
      claimed_at DATETIME NULL,
      claim_token VARCHAR(80) NULL,
      tries INT NOT NULL DEFAULT 0,
      provider_message_id VARCHAR(160) NULL,
      last_error VARCHAR(400) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email_outbox_attempt (campaign_id, recipient_id, attempt_key),
      INDEX idx_email_outbox_status (status, scheduled_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_provider_events (
      id VARCHAR(90) PRIMARY KEY,
      svix_id VARCHAR(160) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      provider_message_id VARCHAR(160) NULL,
      campaign_id VARCHAR(90) NULL,
      recipient_id VARCHAR(90) NULL,
      payload_json LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email_provider_svix (svix_id),
      INDEX idx_email_provider_message (provider_message_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_resources (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(80) NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT,
      access_mode VARCHAR(40) NOT NULL DEFAULT 'registrant_link',
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      available_from DATETIME NULL,
      available_until DATETIME NULL,
      current_version_id VARCHAR(90) NULL,
      pin_version TINYINT(1) NOT NULL DEFAULT 0,
      created_by VARCHAR(90) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_event_resources_event (event_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_resource_versions (
      id VARCHAR(90) PRIMARY KEY,
      resource_id VARCHAR(90) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      byte_size INT NOT NULL DEFAULT 0,
      checksum_sha256 VARCHAR(64) NULL,
      kind VARCHAR(20) NOT NULL DEFAULT 'file',
      external_url LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_resource_versions_resource (resource_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_resource_grants (
      id VARCHAR(90) PRIMARY KEY,
      resource_id VARCHAR(90) NOT NULL,
      event_id VARCHAR(80) NOT NULL,
      registration_id VARCHAR(90) NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      last_access_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_event_resource_token (token_hash),
      INDEX idx_event_resource_grants_reg (registration_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_preferences (
      email_normalized VARCHAR(255) PRIMARY KEY,
      marketing_opt_in TINYINT(1) NULL,
      marketing_opt_in_at DATETIME NULL,
      marketing_source VARCHAR(80) NULL,
      marketing_wording_version VARCHAR(80) NULL,
      unsubscribed_at DATETIME NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email_normalized VARCHAR(255) NOT NULL,
      reason VARCHAR(40) NOT NULL,
      source VARCHAR(80) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (email_normalized, reason)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_design_templates (
      id VARCHAR(90) PRIMARY KEY,
      slug VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      purpose VARCHAR(40) NOT NULL DEFAULT 'event_service',
      subject VARCHAR(250) NOT NULL DEFAULT '',
      preheader VARCHAR(250) NOT NULL DEFAULT '',
      design_json LONGTEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_audit_log (
      id VARCHAR(90) PRIMARY KEY,
      actor_id VARCHAR(90) NULL,
      action VARCHAR(80) NOT NULL,
      campaign_id VARCHAR(90) NULL,
      resource_id VARCHAR(90) NULL,
      detail VARCHAR(400) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_audit_campaign (campaign_id)
    )
  `);

  for (const item of EMAIL_DESIGN_TEMPLATE_SEED) {
    await pool.query(
      `INSERT INTO email_design_templates (id, slug, name, purpose, subject, preheader, design_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), subject = VALUES(subject), preheader = VALUES(preheader)`,
      [
        `edsgn-${item.slug}`,
        item.slug,
        item.name,
        item.purpose,
        item.subject,
        item.preheader,
        JSON.stringify(item.design),
      ],
    );
  }
}
