import crypto from 'node:crypto';
import {
  buildEnquirySummary,
  normalizeEnquiryInput,
  normalizeEnquiryReview,
} from '../shared/speakingEnquiries.js';
import { SPEAKING_ROLES } from '../shared/speakingEngagements.js';
import { createEngagement, deleteEngagement, getAdminEngagement } from './speakingService.js';

const TABLE = 'speaking_enquiries';

const ENQUIRY_FIELDS = [
  'organiser_name', 'organisation', 'email', 'phone', 'event_title',
  'proposed_start_date', 'proposed_end_date', 'date_undecided', 'timezone',
  'attendance_format', 'location', 'audience', 'audience_size', 'topic',
  'requested_role', 'budget', 'message',
];

// ── Spam protection ──────────────────────────────────────────────────────────
// The form fetches a signed timestamp when it loads. Bots that post instantly,
// replay a stale token, or forge one are turned away without a CAPTCHA service.

export const ENQUIRY_TOKEN_MIN_AGE_MS = 3_000;
export const ENQUIRY_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function signTimestamp(secret, timestamp) {
  return crypto.createHmac('sha256', String(secret)).update(`speaking-enquiry:${timestamp}`).digest('base64url');
}

export function issueEnquiryToken(secret, now = Date.now()) {
  const timestamp = String(Math.floor(now));
  return `${timestamp}.${signTimestamp(secret, timestamp)}`;
}

/** @returns {'ok' | 'invalid' | 'too_fast' | 'expired'} */
export function checkEnquiryToken(token, secret, now = Date.now()) {
  const [timestamp, signature] = String(token || '').split('.');
  if (!/^\d{10,}$/.test(timestamp || '') || !signature) return 'invalid';
  const expected = Buffer.from(signTimestamp(secret, timestamp));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return 'invalid';
  const age = now - Number(timestamp);
  if (age < ENQUIRY_TOKEN_MIN_AGE_MS) return 'too_fast';
  if (age > ENQUIRY_TOKEN_MAX_AGE_MS) return 'expired';
  return 'ok';
}

export function hashIp(ip, secret) {
  return crypto.createHash('sha256').update(`${secret}:${ip || 'unknown'}`).digest('hex');
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Admin shape; the IP hash stays in the database. */
export function mapEnquiry(row) {
  if (!row) return null;
  const enquiry = { ...row, date_undecided: Number(row.date_undecided) === 1 };
  delete enquiry.ip_hash;
  return enquiry;
}

async function findRow(pool, id) {
  const [[row]] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [String(id || '')]);
  return row || null;
}

export async function createEnquiry(pool, input, { id, ipHash = null } = {}) {
  const { value, errors } = normalizeEnquiryInput(input);
  if (Object.keys(errors).length) return { errors };
  const columns = ['id', ...ENQUIRY_FIELDS, 'status', 'ip_hash'];
  const params = [id, ...ENQUIRY_FIELDS.map((f) => value[f]), 'new', ipHash];
  await pool.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    params,
  );
  return { enquiry: mapEnquiry(await findRow(pool, id)) };
}

export async function recordEnquiryEmailStatus(pool, id, { admin, ack }) {
  await pool.query(
    `UPDATE ${TABLE} SET admin_email_status = ?, ack_email_status = ? WHERE id = ?`,
    [admin || null, ack || null, id],
  );
}

export async function countNewEnquiries(pool) {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE status = ?`, ['new']);
  return Number(row?.total || 0);
}

export async function listEnquiries(pool) {
  const [rows] = await pool.query(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`);
  return rows.map(mapEnquiry);
}

export async function getEnquiry(pool, id) {
  return mapEnquiry(await findRow(pool, id));
}

/** Only the review status and private notes can change; the submission itself is kept as sent. */
export async function reviewEnquiry(pool, id, input) {
  const existing = await findRow(pool, id);
  if (!existing) return { notFound: true };
  const { value, errors } = normalizeEnquiryReview(input);
  if (Object.keys(errors).length) return { errors };
  const fields = Object.keys(value);
  if (fields.length) {
    await pool.query(
      `UPDATE ${TABLE} SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map((f) => value[f]), existing.id],
    );
  }
  return { enquiry: mapEnquiry(await findRow(pool, existing.id)) };
}

/** After a reply is sent, a new enquiry moves into review; any later status the admin chose is kept. */
export async function markEnquiryReplied(pool, enquiry) {
  const status = enquiry.status === 'new' ? 'reviewing' : enquiry.status;
  await pool.query(`UPDATE ${TABLE} SET status = ?, replied_at = NOW() WHERE id = ?`, [status, enquiry.id]);
  return mapEnquiry(await findRow(pool, enquiry.id));
}

export async function deleteEnquiry(pool, id) {
  const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [String(id || '')]);
  return result.affectedRows > 0;
}

/**
 * Explicit admin action: copy an enquiry into a new draft engagement marked
 * "Invited". Nothing is confirmed or published; the organiser's contact details
 * go into the engagement's private notes only.
 */
const DRAFT_EXISTS = 'A draft engagement was already created from this enquiry.';

export async function createDraftFromEnquiry(pool, id, { newId, actor = null } = {}) {
  const enquiry = await findRow(pool, id);
  if (!enquiry) return { notFound: true };
  // A link to an engagement that has since been deleted counts as no link.
  const linkedId = enquiry.engagement_id || null;
  if (linkedId && await getAdminEngagement(pool, linkedId)) return { conflict: DRAFT_EXISTS };

  const undecided = Number(enquiry.date_undecided) === 1 || !enquiry.proposed_start_date;
  const role = SPEAKING_ROLES.some((r) => r.value === enquiry.requested_role) ? [enquiry.requested_role] : [];
  const format = ['in_person', 'online', 'hybrid'].includes(enquiry.attendance_format) ? enquiry.attendance_format : '';

  const result = await createEngagement(pool, {
    event_title: enquiry.event_title,
    organiser: enquiry.organisation,
    roles: role,
    session_title: String(enquiry.topic || '').slice(0, 255),
    start_date: undecided ? '' : enquiry.proposed_start_date,
    end_date: undecided ? '' : enquiry.proposed_end_date || '',
    dates_tbc: undecided,
    timezone: enquiry.timezone,
    attendance_format: format,
    venue: enquiry.location || '',
    participation_status: 'invited',
    admin_notes: `Created from a speaking enquiry received ${String(enquiry.created_at || '').slice(0, 16)}.\n\n${buildEnquirySummary(enquiry)}`,
  }, { id: newId, actor });
  if (result.errors) return result;

  // Two admins (or two tabs) can get this far at the same moment. Only the
  // request that still finds the link as it read it may set it (<=> is
  // MySQL's null-safe equals); the other removes its copy, so one draft remains.
  const [claim] = await pool.query(
    `UPDATE ${TABLE} SET engagement_id = ? WHERE id = ? AND engagement_id <=> ?`,
    [result.engagement.id, enquiry.id, linkedId],
  );
  if (claim.affectedRows !== 1) {
    await deleteEngagement(pool, result.engagement.id);
    return { conflict: DRAFT_EXISTS };
  }
  return { engagement: result.engagement, enquiry: mapEnquiry(await findRow(pool, enquiry.id)) };
}
