/**
 * Seed a sample attendance certificate for preview/testing.
 * Usage: node server/scripts/seed-demo-certificate.js [user-email]
 * Default email: admin@mutale.dev
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from '../db.js';
import { issueCertificateForRegistration } from '../certificateService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config();

const DEMO_EVENT_ID = 'evt-demo-certificate-preview';
const DEMO_REG_ID = 'reg-demo-certificate-preview';
const DEMO_EVENT_SLUG = 'demo-qa-workshop-certificate-preview';

async function ensureDemoEvent() {
  const title = 'ISO 15189 Laboratory Quality Systems Workshop';
  await pool.query(
    `INSERT INTO events (
      id, title, slug, short_description, description, event_mode,
      location, start_date, end_date, start_time, end_time,
      timezone, booking_type, price, is_free, status, visibility, category
    ) VALUES (?, ?, ?, ?, ?, 'virtual', ?, ?, ?, '09:00:00', '16:30:00',
      'Africa/Lusaka', 'subscription', 0, 1, 'completed', 'public', 'Quality Systems')
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      end_date = VALUES(end_date),
      start_date = VALUES(start_date),
      status = 'completed'`,
    [
      DEMO_EVENT_ID,
      title,
      DEMO_EVENT_SLUG,
      'Hands-on quality systems training for diagnostic laboratories.',
      'A practical workshop covering ISO 15189 implementation, internal audits, and quality indicators.',
      'Virtual — Zoom',
      '2025-03-10',
      '2025-03-12',
    ],
  );
}

async function ensureDemoRegistration(user) {
  const ref = 'MM-DEMO-CERT-001';
  await pool.query(
    `INSERT INTO event_registrations (
      id, user_id, user_name, user_email, event_id, event_title, event_slug,
      reference_code, registration_type, status, payment_status, amount_zmw,
      registered_at, attended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'subscription', 'attended', 'not_required', 0, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      user_name = VALUES(user_name),
      user_email = VALUES(user_email),
      status = 'attended',
      attended_at = COALESCE(attended_at, NOW())`,
    [
      DEMO_REG_ID,
      user.id,
      user.name || 'Mutale Mubanga',
      user.email,
      DEMO_EVENT_ID,
      'ISO 15189 Laboratory Quality Systems Workshop',
      DEMO_EVENT_SLUG,
      ref,
    ],
  );
}

async function main() {
  const email = String(process.argv[2] || 'admin@mutale.dev').trim().toLowerCase();

  const [[user]] = await pool.query(
    'SELECT id, name, email FROM users WHERE LOWER(email) = ? LIMIT 1',
    [email],
  );

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Seeding demo certificate for ${user.name} <${user.email}>…`);

  await ensureDemoEvent();
  await ensureDemoRegistration(user);

  const result = await issueCertificateForRegistration(pool, DEMO_REG_ID, appRoot);

  if (result.status === 'error' || result.status === 'skipped') {
    console.error('Could not issue certificate:', result.reason || result.status);
    process.exit(1);
  }

  const cert = result.certificate;
  await pool.query(
    `UPDATE event_certificates
     SET email_status = 'sent', email_sent_at = NOW(), email_error = NULL
     WHERE id = ?`,
    [cert.id],
  );

  console.log('');
  console.log(result.status === 'exists' ? 'Certificate already existed (reusing):' : 'Certificate created:');
  console.log(`  Code:    ${cert.certificate_code}`);
  console.log(`  Event:   ${cert.event_title}`);
  console.log(`  PDF:     uploads/${cert.pdf_path}`);
  console.log('');
  console.log('Open the app → log in as this user → /account/profile → Certificates tab');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
