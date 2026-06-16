CREATE DATABASE IF NOT EXISTS mutale;
USE mutale;

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  short_description TEXT,
  description LONGTEXT,
  cover_image LONGTEXT,
  event_mode VARCHAR(50) DEFAULT 'virtual',
  meeting_platform VARCHAR(50) DEFAULT '',
  meeting_link LONGTEXT,
  venue VARCHAR(255),
  location VARCHAR(255),
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  timezone VARCHAR(100),
  capacity INT,
  booking_type VARCHAR(30) DEFAULT 'subscription',
  price DECIMAL(10,2) DEFAULT 0,
  is_free BOOLEAN DEFAULT TRUE,
  status VARCHAR(30) DEFAULT 'draft',
  registration_deadline DATE,
  registration_deadline_time TIME,
  visibility VARCHAR(30) DEFAULT 'public',
  organizer_name VARCHAR(255),
  organizer_email VARCHAR(255),
  organizer_phone VARCHAR(50),
  category VARCHAR(100),
  featured BOOLEAN DEFAULT FALSE,
  forum_enabled TINYINT(1) NOT NULL DEFAULT 0,
  delivery_mode VARCHAR(30) DEFAULT 'virtual',
  provider VARCHAR(30) DEFAULT 'internal',
  zoom_meeting_id VARCHAR(64),
  zoom_uuid VARCHAR(255),
  zoom_join_url LONGTEXT,
  zoom_start_url LONGTEXT,
  zoom_password VARCHAR(64),
  zoom_host_email VARCHAR(255),
  zoom_status VARCHAR(50),
  zoom_created_at DATETIME,
  zoom_synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id VARCHAR(90) PRIMARY KEY,
  user_id VARCHAR(90) NOT NULL,
  user_name VARCHAR(180),
  user_email VARCHAR(255),
  event_id VARCHAR(90) NOT NULL,
  event_title VARCHAR(255),
  event_slug VARCHAR(255),
  reference_code VARCHAR(120) NOT NULL,
  registration_type VARCHAR(40) DEFAULT 'subscription',
  status VARCHAR(40) DEFAULT 'confirmed',
  amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'ZMW',
  amount_zmw DECIMAL(12,2) DEFAULT 0,
  payment_status VARCHAR(40) DEFAULT 'unpaid',
  payment_method VARCHAR(60) DEFAULT '',
  payment_reference VARCHAR(120) DEFAULT '',
  booked_for_name VARCHAR(180) NULL,
  booked_for_relation VARCHAR(60) NULL,
  attendee_slot_key VARCHAR(160) NOT NULL DEFAULT '__self__',
  notes TEXT,
  coupon_id VARCHAR(90) NULL,
  coupon_code VARCHAR(64) NULL,
  list_price_zmw DECIMAL(12,2) NULL,
  discount_zmw DECIMAL(12,2) NOT NULL DEFAULT 0,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_user_type_slot (event_id, user_id, registration_type, attendee_slot_key),
  UNIQUE KEY uq_event_reference_code (reference_code),
  INDEX idx_event_registrations_event_id (event_id),
  INDEX idx_event_registrations_user_id (user_id),
  INDEX idx_event_registrations_status (status),
  INDEX idx_event_registrations_registered_at (registered_at),
  CONSTRAINT fk_event_registrations_event
    FOREIGN KEY (event_id) REFERENCES events(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS event_coupons (
  id VARCHAR(90) PRIMARY KEY,
  event_id VARCHAR(90) NOT NULL,
  code VARCHAR(64) NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_redemptions INT NULL,
  redemptions_count INT NOT NULL DEFAULT 0,
  max_per_user INT NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_until DATE NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  label VARCHAR(120) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_coupons_event_code (event_id, code),
  INDEX idx_event_coupons_event (event_id)
);

CREATE TABLE IF NOT EXISTS event_forum_topics (
  id VARCHAR(90) PRIMARY KEY,
  event_id VARCHAR(90) NOT NULL,
  user_id VARCHAR(90) NOT NULL,
  user_name VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  last_activity_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_topics_event (event_id),
  INDEX idx_forum_topics_activity (event_id, last_activity_at)
);

CREATE TABLE IF NOT EXISTS event_forum_replies (
  id VARCHAR(90) PRIMARY KEY,
  topic_id VARCHAR(90) NOT NULL,
  event_id VARCHAR(90) NOT NULL,
  user_id VARCHAR(90) NOT NULL,
  user_name VARCHAR(255) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_replies_topic (topic_id),
  INDEX idx_forum_replies_event (event_id)
);

CREATE TABLE IF NOT EXISTS event_certificates (
  id VARCHAR(90) PRIMARY KEY,
  certificate_code VARCHAR(64) NOT NULL UNIQUE,
  event_id VARCHAR(90) NOT NULL,
  registration_id VARCHAR(90) NOT NULL,
  user_id VARCHAR(90) NOT NULL,
  attendee_name VARCHAR(255) NOT NULL,
  attendee_email VARCHAR(255),
  event_title VARCHAR(255) NOT NULL,
  event_end_date DATE NULL,
  pdf_path VARCHAR(500) NOT NULL,
  issued_at DATETIME NOT NULL,
  email_status VARCHAR(40) DEFAULT 'pending',
  email_sent_at DATETIME NULL,
  email_error TEXT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_certificates_registration (registration_id),
  INDEX idx_event_certificates_event_id (event_id),
  INDEX idx_event_certificates_user_id (user_id),
  INDEX idx_event_certificates_issued_at (issued_at),
  INDEX idx_event_certificates_email_status (email_status),
  CONSTRAINT fk_event_certificates_event
    FOREIGN KEY (event_id) REFERENCES events(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_event_certificates_registration
    FOREIGN KEY (registration_id) REFERENCES event_registrations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(120),
  date DATE,
  excerpt TEXT,
  content LONGTEXT,
  featured BOOLEAN DEFAULT FALSE,
  read_time VARCHAR(80) DEFAULT '1 min read',
  image LONGTEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_profile (
  id TINYINT PRIMARY KEY,
  data JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id TINYINT PRIMARY KEY,
  data JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
