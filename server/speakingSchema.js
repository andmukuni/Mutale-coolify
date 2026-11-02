import { DEFAULT_SPEAKING_TIMEZONE } from '../shared/speakingEngagements.js';

/**
 * Speaking engagements are stored apart from `events`, so nothing here can
 * trigger registration, payment, receipts, or attendee communications.
 */
export async function ensureSpeakingSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS speaking_engagements (
      id VARCHAR(90) PRIMARY KEY,
      event_title VARCHAR(255) NOT NULL,
      organiser VARCHAR(255) NULL,
      event_type VARCHAR(40) NULL,
      roles_json TEXT NULL,
      session_title VARCHAR(255) NULL,
      description VARCHAR(600) NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      dates_tbc TINYINT(1) NOT NULL DEFAULT 0,
      session_date DATE NULL,
      session_start_time TIME NULL,
      session_end_time TIME NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT '${DEFAULT_SPEAKING_TIMEZONE}',
      attendance_format VARCHAR(20) NULL,
      venue VARCHAR(255) NULL,
      city VARCHAR(120) NULL,
      country VARCHAR(120) NULL,
      audience_access VARCHAR(20) NOT NULL DEFAULT 'unspecified',
      event_url VARCHAR(2048) NULL,
      image_url VARCHAR(1024) NULL,
      image_alt VARCHAR(255) NULL,
      participation_status VARCHAR(20) NOT NULL DEFAULT 'invited',
      event_status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      publication_state VARCHAR(20) NOT NULL DEFAULT 'draft',
      featured TINYINT(1) NOT NULL DEFAULT 0,
      topics_json TEXT NULL,
      media_json TEXT NULL,
      admin_notes TEXT NULL,
      published_at DATETIME NULL,
      hidden_at DATETIME NULL,
      created_by VARCHAR(191) NULL,
      updated_by VARCHAR(191) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_speaking_public (publication_state, participation_status, start_date),
      INDEX idx_speaking_featured (featured)
    )
  `);

  // Invitations from the public form. Never shown publicly; an admin may turn
  // one into a draft engagement, which links back through engagement_id.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS speaking_enquiries (
      id VARCHAR(90) PRIMARY KEY,
      organiser_name VARCHAR(120) NOT NULL,
      organisation VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(40) NULL,
      event_title VARCHAR(200) NOT NULL,
      proposed_start_date DATE NULL,
      proposed_end_date DATE NULL,
      date_undecided TINYINT(1) NOT NULL DEFAULT 0,
      timezone VARCHAR(64) NOT NULL DEFAULT '${DEFAULT_SPEAKING_TIMEZONE}',
      attendance_format VARCHAR(20) NULL,
      location VARCHAR(200) NULL,
      audience VARCHAR(300) NOT NULL,
      audience_size VARCHAR(60) NULL,
      topic VARCHAR(300) NOT NULL,
      requested_role VARCHAR(40) NULL,
      budget VARCHAR(120) NULL,
      message TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      admin_notes TEXT NULL,
      engagement_id VARCHAR(90) NULL,
      admin_email_status VARCHAR(20) NULL,
      ack_email_status VARCHAR(20) NULL,
      replied_at DATETIME NULL,
      ip_hash CHAR(64) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_speaking_enquiries_status (status, created_at)
    )
  `);

  // Topics (for filters) and media links (recordings, slides…) were added after
  // the first release, so older tables get them here.
  const [engagementColumns] = await pool.query('SHOW COLUMNS FROM speaking_engagements');
  const engagementHas = new Set(engagementColumns.map((column) => column.Field));
  if (!engagementHas.has('topics_json')) {
    await pool.query('ALTER TABLE speaking_engagements ADD COLUMN topics_json TEXT NULL AFTER featured');
  }
  if (!engagementHas.has('media_json')) {
    await pool.query('ALTER TABLE speaking_engagements ADD COLUMN media_json TEXT NULL AFTER topics_json');
  }

  // Daily totals of event-website clicks, downloads and similar actions. No
  // visitor details are stored; see server/speakingMetricsService.js.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS speaking_metrics (
      metric VARCHAR(40) NOT NULL,
      engagement_id VARCHAR(90) NOT NULL DEFAULT '',
      day DATE NOT NULL,
      total INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (metric, engagement_id, day)
    )
  `);

  // Tables created before replies were sent from the admin area.
  const [columns] = await pool.query('SHOW COLUMNS FROM speaking_enquiries');
  if (!columns.some((column) => column.Field === 'replied_at')) {
    await pool.query('ALTER TABLE speaking_enquiries ADD COLUMN replied_at DATETIME NULL AFTER ack_email_status');
  }
}
