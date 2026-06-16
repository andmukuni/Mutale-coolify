/**
 * Populate admin@mutale.dev (or given email) with rich profile + CV demo data.
 *
 * Usage:
 *   node server/scripts/seed-admin-cv-profile.js [email]
 *   node server/scripts/seed-admin-cv-profile.js admin@mutale.dev --unlock-downloads
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from '../db.js';
import { issueCertificateForRegistration } from '../certificateService.js';
import { normalizeCvSections } from '../../shared/cvProfileSections.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config();

const DEFAULT_EMAIL = 'admin@mutale.dev';

/** Rich profile fields for CV / account UI */
const PROFILE = {
  name: 'Mutale Mubanga',
  phone: '+260 977 456 789',
  whatsapp: '+260 977 456 789',
  profession: 'Laboratory Quality Systems Specialist & Health Informatics Consultant',
  occupation: 'Independent Consultant',
  organization: 'Mutale Mubanga — Laboratory Quality & Training',
  about: `Consultant with 12+ years supporting diagnostic networks across Southern Africa to implement ISO 15189, strengthen internal quality control, and build sustainable laboratory management systems.

I design and deliver practical training for bench scientists, quality managers, and laboratory directors—translating accreditation requirements into workflows teams can maintain after the workshop ends. Recent work includes gap assessments, document control rollouts, IQC/EQA programme design, and mentoring teams through pre-assessment and surveillance audits.

Based in Lusaka, I collaborate with ministries of health, reference laboratories, and NGO partners on quality improvement, digital health readiness, and event-based learning programmes delivered through the Mutale Mubanga platform.`,
  specialties: [
    'ISO 15189 implementation',
    'Laboratory quality management',
    'Internal auditing & CAPA',
    'IQC / EQA programme design',
    'Health informatics',
    'Training & capacity building',
    'Diagnostic network strengthening',
    'Document control & LIMS readiness',
  ].join(','),
  interests: [
    'Laboratory accreditation',
    'Public health systems',
    'Digital health',
    'Professional development',
  ].join(','),
  portfolio_url: 'https://mutale.dev',
  linkedin_url: 'https://www.linkedin.com/in/mutalemubanga',
  linkedin_handle: 'mutalemubanga',
  address: 'Lusaka, Zambia',
  nrc_id: '',
  user_type: 'local',
  kyc_completed: 1,
  email_verified: 1,
};

const CV_SECTIONS = normalizeCvSections({
  experience: [
    {
      title: 'Laboratory Quality Systems Specialist',
      company: 'Mutale Mubanga — Laboratory Quality & Training',
      location: 'Lusaka, Zambia',
      startDate: 'Jan 2018',
      endDate: '',
      current: true,
      description: 'Lead ISO 15189 gap assessments and implementation support for public-sector laboratory networks.\nDesign and deliver accredited training workshops for quality managers and bench scientists.\nMentor teams through pre-assessment, surveillance audits, and corrective action cycles.',
    },
    {
      title: 'Senior Quality Assurance Officer',
      company: 'Ministry of Health — National Reference Laboratory',
      location: 'Lusaka, Zambia',
      startDate: 'Mar 2012',
      endDate: 'Dec 2017',
      current: false,
      description: 'Coordinated national IQC/EQA programmes and document control systems.\nSupported regional laboratories with internal audit programmes and KPI reporting.',
    },
  ],
  education: [
    {
      institution: 'University of Zambia',
      degree: 'Bachelor of Science',
      field: 'Biomedical Sciences',
      startYear: '2006',
      endYear: '2010',
      description: 'Focus on laboratory science and public health diagnostics.',
    },
    {
      institution: 'Zambia Institute of Quality',
      degree: 'Postgraduate Certificate',
      field: 'Quality Management Systems',
      startYear: '2014',
      endYear: '2015',
      description: '',
    },
  ],
  references: [
    {
      name: 'Dr. Chanda Bwalya',
      title: 'Director of Laboratory Services',
      organization: 'Ministry of Health',
      email: 'c.bwalya@example.gov.zm',
      phone: '+260 211 000 000',
      relationship: 'Former supervisor',
    },
    {
      name: 'Sarah Mwamba',
      title: 'Quality Manager',
      organization: 'National Reference Laboratory',
      email: 's.mwamba@example.gov.zm',
      phone: '+260 977 000 001',
      relationship: 'Professional colleague',
    },
  ],
});

const DEMO_EVENTS = [
  {
    id: 'evt-demo-certificate-preview',
    regId: 'reg-demo-certificate-preview',
    slug: 'demo-qa-workshop-certificate-preview',
    title: 'ISO 15189 Laboratory Quality Systems Workshop',
    shortDescription: 'Hands-on quality systems training for diagnostic laboratories.',
    description:
      'A practical workshop covering ISO 15189 implementation, internal audits, quality indicators, and management review.',
    location: 'Virtual — Zoom',
    startDate: '2025-03-10',
    endDate: '2025-03-12',
    category: 'Quality Systems',
    ref: 'MM-DEMO-CERT-001',
    registeredAt: '2025-03-08 09:00:00',
    attendedAt: '2025-03-12 16:30:00',
  },
  {
    id: 'evt-demo-health-informatics-lab',
    regId: 'reg-demo-health-informatics-lab',
    slug: 'health-informatics-public-sector-labs',
    title: 'Health Informatics for Public Sector Laboratories',
    shortDescription: 'Data standards, reporting, and LIMS readiness for national networks.',
    description:
      'Focused programme on indicator reporting, interoperability, and governance for laboratory information systems.',
    location: 'Lusaka — Hybrid',
    startDate: '2025-09-15',
    endDate: '2025-09-17',
    category: 'Health Informatics',
    ref: 'MM-DEMO-REG-002',
    registeredAt: '2025-09-01 10:00:00',
    attendedAt: '2025-09-17 15:00:00',
  },
  {
    id: 'evt-demo-leadership-qa',
    regId: 'reg-demo-leadership-qa',
    slug: 'laboratory-leadership-quality-improvement',
    title: 'Laboratory Leadership & Continuous Quality Improvement',
    shortDescription: 'Leadership skills for quality managers and laboratory directors.',
    description:
      'Covers team engagement, root cause analysis, KPI dashboards, and sustaining improvement cycles.',
    location: 'Ndola — In person',
    startDate: '2026-01-20',
    endDate: '2026-01-22',
    category: 'Leadership',
    ref: 'MM-DEMO-REG-003',
    registeredAt: '2026-01-05 08:30:00',
    attendedAt: '2026-01-22 17:00:00',
  },
];

async function ensureCvUnlockColumn() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN cv_unlocked_at DATETIME NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }
}

async function ensureCvSectionsColumn() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN cv_sections JSON NULL');
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e;
  }
}

async function updateUserProfile(userId, unlockDownloads) {
  await ensureCvSectionsColumn();
  await pool.query(
    `UPDATE users SET
      name = ?,
      phone = ?,
      whatsapp = ?,
      profession = ?,
      occupation = ?,
      organization = ?,
      about = ?,
      specialties = ?,
      interests = ?,
      portfolio_url = ?,
      linkedin_url = ?,
      linkedin_handle = ?,
      address = ?,
      nrc_id = ?,
      user_type = ?,
      kyc_completed = ?,
      email_verified = ?,
      cv_sections = ?,
      cv_unlocked_at = CASE WHEN ? = 1 THEN COALESCE(cv_unlocked_at, NOW()) ELSE cv_unlocked_at END
    WHERE id = ?`,
    [
      PROFILE.name,
      PROFILE.phone,
      PROFILE.whatsapp,
      PROFILE.profession,
      PROFILE.occupation,
      PROFILE.organization,
      PROFILE.about,
      PROFILE.specialties,
      PROFILE.interests,
      PROFILE.portfolio_url,
      PROFILE.linkedin_url,
      PROFILE.linkedin_handle,
      PROFILE.address,
      PROFILE.nrc_id,
      PROFILE.user_type,
      PROFILE.kyc_completed,
      PROFILE.email_verified,
      JSON.stringify(CV_SECTIONS),
      unlockDownloads ? 1 : 0,
      userId,
    ],
  );
}

async function ensureEvent(ev) {
  await pool.query(
    `INSERT INTO events (
      id, title, slug, short_description, description, event_mode,
      location, start_date, end_date, start_time, end_time,
      timezone, booking_type, price, is_free, status, visibility, category
    ) VALUES (?, ?, ?, ?, ?, 'virtual', ?, ?, ?, '09:00:00', '16:30:00',
      'Africa/Lusaka', 'subscription', 0, 1, 'completed', 'public', ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      short_description = VALUES(short_description),
      description = VALUES(description),
      location = VALUES(location),
      end_date = VALUES(end_date),
      start_date = VALUES(start_date),
      status = 'completed'`,
    [
      ev.id,
      ev.title,
      ev.slug,
      ev.shortDescription,
      ev.description,
      ev.location,
      ev.startDate,
      ev.endDate,
      ev.category,
    ],
  );
}

async function ensureRegistration(user, ev) {
  await pool.query(
    `INSERT INTO event_registrations (
      id, user_id, user_name, user_email, event_id, event_title, event_slug,
      reference_code, registration_type, status, payment_status, amount_zmw,
      registered_at, attended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'subscription', 'attended', 'not_required', 0, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_name = VALUES(user_name),
      user_email = VALUES(user_email),
      event_title = VALUES(event_title),
      status = 'attended',
      attended_at = VALUES(attended_at),
      registered_at = VALUES(registered_at)`,
    [
      ev.regId,
      user.id,
      PROFILE.name,
      user.email,
      ev.id,
      ev.title,
      ev.slug,
      ev.ref,
      ev.registeredAt,
      ev.attendedAt,
    ],
  );
}

async function issueCertIfNeeded(regId) {
  const result = await issueCertificateForRegistration(pool, regId, appRoot);
  if (result.status === 'error' || result.status === 'skipped') {
    console.warn(`  Certificate for ${regId}: ${result.reason || result.status}`);
    return null;
  }
  const cert = result.certificate;
  if (cert?.id) {
    await pool.query(
      `UPDATE event_certificates
       SET email_status = 'sent', email_sent_at = NOW(), email_error = NULL
       WHERE id = ?`,
      [cert.id],
    );
  }
  return cert;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
  const email = String(args[0] || DEFAULT_EMAIL).trim().toLowerCase();
  const unlockDownloads = flags.has('--unlock-downloads');

  const [[user]] = await pool.query(
    'SELECT id, name, email, profession, about FROM users WHERE LOWER(email) = ? LIMIT 1',
    [email],
  );

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error('Run the API once to seed the default admin, or create the user first.');
    process.exit(1);
  }

  console.log(`\nSeeding CV profile for ${user.email} (${user.id})…\n`);

  await ensureCvUnlockColumn();
  await updateUserProfile(user.id, unlockDownloads);

  console.log('Profile updated:');
  console.log(`  Name:         ${PROFILE.name}`);
  console.log(`  Profession:   ${PROFILE.profession}`);
  console.log(`  Organization: ${PROFILE.organization}`);
  console.log(`  Phone:        ${PROFILE.phone}`);
  console.log(`  Specialties:  ${PROFILE.specialties.split(',').length} items`);
  console.log(`  Experience:   ${CV_SECTIONS.experience.length} roles`);
  console.log(`  Education:    ${CV_SECTIONS.education.length} entries`);
  console.log(`  References:   ${CV_SECTIONS.references.length} contacts`);
  if (unlockDownloads) console.log('  CV downloads: unlocked (cv_unlocked_at set)');

  console.log('\nEvents & registrations:');
  for (const ev of DEMO_EVENTS) {
    await ensureEvent(ev);
    await ensureRegistration(user, ev);
    console.log(`  ✓ Attended: ${ev.title}`);
  }

  console.log('\nCertificates (first event):');
  const cert = await issueCertIfNeeded(DEMO_EVENTS[0].regId);
  if (cert) {
    console.log(`  Code: ${cert.certificate_code}`);
    console.log(`  PDF:  uploads/${cert.pdf_path}`);
  }

  console.log('\nDone. Sign in as this user and open:');
  console.log('  /account/profile  → Edit profile / CV generator');
  console.log('  /account/cv       → Templates & preview');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
