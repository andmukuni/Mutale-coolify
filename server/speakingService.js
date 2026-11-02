import {
  classifyEngagement,
  groupEngagements,
  isPubliclyVisible,
  normalizeEngagementInput,
  toPublicEngagement,
} from '../shared/speakingEngagements.js';

const TABLE = 'speaking_engagements';

/** Columns an admin edit may write. Publication state is changed only by publish/hide. */
export const ENGAGEMENT_WRITABLE_FIELDS = [
  'event_title',
  'organiser',
  'event_type',
  'roles_json',
  'session_title',
  'description',
  'start_date',
  'end_date',
  'dates_tbc',
  'session_date',
  'session_start_time',
  'session_end_time',
  'timezone',
  'attendance_format',
  'venue',
  'city',
  'country',
  'audience_access',
  'event_url',
  'image_url',
  'image_alt',
  'participation_status',
  'event_status',
  'featured',
  'topics_json',
  'media_json',
  'admin_notes',
];

function parseJsonList(value) {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Full admin shape — includes private notes. Never send this to a public route. */
export function mapAdminEngagement(row) {
  if (!row) return null;
  const { roles_json: rolesJson, topics_json: topicsJson, media_json: mediaJson, ...rest } = row;
  return {
    ...rest,
    roles: parseJsonList(rolesJson),
    topics: parseJsonList(topicsJson),
    media: parseJsonList(mediaJson),
    dates_tbc: Number(row.dates_tbc) === 1,
    featured: Number(row.featured) === 1,
  };
}

/** Admin rows back into the input shape accepted by normalizeEngagementInput. */
function toEditableInput(row) {
  const admin = mapAdminEngagement(row);
  const input = {};
  for (const field of ENGAGEMENT_WRITABLE_FIELDS) {
    if (field === 'roles_json') input.roles = admin.roles;
    else if (field === 'topics_json') input.topics = admin.topics;
    else if (field === 'media_json') input.media = admin.media;
    else input[field] = admin[field];
  }
  return input;
}

async function findRow(pool, id) {
  const [[row]] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [String(id || '')]);
  return row || null;
}

// ── Public reads ──────────────────────────────────────────────────────────────
// Every public surface (page, detail, homepage widget, calendar export, site
// assistant) must read through these two functions.

export async function listPublicEngagements(pool, { now = new Date() } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM ${TABLE} WHERE publication_state = ? AND participation_status <> ?`,
    ['published', 'declined'],
  );
  const groups = groupEngagements(rows.filter(isPubliclyVisible), now);
  const serialize = (section) => groups[section].map(({ row, inProgress }) => toPublicEngagement(row, { section, inProgress }));
  return {
    upcoming: serialize('upcoming'),
    previous: serialize('previous'),
    cancelled: serialize('cancelled'),
    tba: serialize('tba'),
  };
}

/** Returns null for drafts, hidden, declined, and missing records alike. */
export async function getPublicEngagement(pool, id, { now = new Date() } = {}) {
  const row = await findRow(pool, id);
  if (!row || !isPubliclyVisible(row)) return null;
  return toPublicEngagement(row, classifyEngagement(row, now));
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listAdminEngagements(pool) {
  const [rows] = await pool.query(`SELECT * FROM ${TABLE} ORDER BY updated_at DESC`);
  return rows.map(mapAdminEngagement);
}

export async function getAdminEngagement(pool, id) {
  return mapAdminEngagement(await findRow(pool, id));
}

/** New records always start as drafts. */
export async function createEngagement(pool, input, { id, actor = null } = {}) {
  const { value, errors } = normalizeEngagementInput(input);
  if (Object.keys(errors).length) return { errors };

  const columns = ['id', ...ENGAGEMENT_WRITABLE_FIELDS, 'publication_state', 'created_by', 'updated_by'];
  const params = [id, ...ENGAGEMENT_WRITABLE_FIELDS.map((f) => value[f]), 'draft', actor, actor];
  await pool.query(
    `INSERT INTO ${TABLE} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    params,
  );
  return { engagement: await getAdminEngagement(pool, id) };
}

/**
 * Merge the edit over the stored record, so a partial update cannot wipe fields.
 * Clearing a field (e.g. removing the event URL) means sending it empty.
 *
 * Participation status never publishes anything. The one link to publication
 * is protective: declining a published engagement also hides it, so marking it
 * Invited or Confirmed again later can't quietly put it back on the website.
 */
export async function updateEngagement(pool, id, input, { actor = null } = {}) {
  const existing = await findRow(pool, id);
  if (!existing) return { notFound: true };

  const { value, errors } = normalizeEngagementInput({ ...toEditableInput(existing), ...input });
  if (Object.keys(errors).length) return { errors };

  const hide = value.participation_status === 'declined' && existing.publication_state === 'published';
  const assignments = [
    ...[...ENGAGEMENT_WRITABLE_FIELDS, 'updated_by'].map((f) => `${f} = ?`),
    ...(hide ? ['publication_state = ?', 'hidden_at = NOW()'] : []),
  ].join(', ');
  await pool.query(
    `UPDATE ${TABLE} SET ${assignments} WHERE id = ?`,
    [...ENGAGEMENT_WRITABLE_FIELDS.map((f) => value[f]), actor, ...(hide ? ['hidden'] : []), existing.id],
  );
  return { engagement: await getAdminEngagement(pool, existing.id) };
}

/** Copies start as unfeatured drafts. */
export async function duplicateEngagement(pool, id, { newId, actor = null } = {}) {
  const existing = await findRow(pool, id);
  if (!existing) return { notFound: true };
  const input = toEditableInput(existing);
  return createEngagement(pool, {
    ...input,
    event_title: `${input.event_title} (copy)`.slice(0, 255),
    featured: false,
  }, { id: newId, actor });
}

/**
 * Explicit publish / hide. Hiding keeps the record intact for republishing.
 * @param {'published' | 'hidden'} state
 */
export async function setPublicationState(pool, id, state, { actor = null } = {}) {
  const existing = await findRow(pool, id);
  if (!existing) return { notFound: true };

  if (state === 'published') {
    if (existing.participation_status === 'declined') {
      return { conflict: 'Declined engagements stay private and cannot be published.' };
    }
    if (existing.publication_state !== 'published') {
      await pool.query(
        `UPDATE ${TABLE} SET publication_state = ?, published_at = NOW(), hidden_at = NULL, updated_by = ? WHERE id = ?`,
        ['published', actor, existing.id],
      );
    }
  } else if (state === 'hidden') {
    if (existing.publication_state !== 'published') {
      return { conflict: 'Only published engagements can be hidden.' };
    }
    await pool.query(
      `UPDATE ${TABLE} SET publication_state = ?, hidden_at = NOW(), updated_by = ? WHERE id = ?`,
      ['hidden', actor, existing.id],
    );
  } else {
    return { conflict: 'Unknown publication state.' };
  }

  return { engagement: await getAdminEngagement(pool, existing.id) };
}

/** Enquiries that became this draft are unlinked, so a new draft can be made from them. */
export async function deleteEngagement(pool, id) {
  const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [String(id || '')]);
  if (result.affectedRows === 0) return false;
  await pool.query('UPDATE speaking_enquiries SET engagement_id = NULL WHERE engagement_id = ?', [String(id)]);
  return true;
}
