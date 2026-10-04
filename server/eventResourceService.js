import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { newCampaignId } from '../shared/emailCampaign.js';
import { sanitizeHttpUrl } from '../shared/emailCampaign.js';

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 15 * 1024 * 1024;

export function privateResourceRoot(appRoot = process.cwd()) {
  return path.join(appRoot, 'private_uploads', 'event-resources');
}

function mapResource(row) {
  if (!row) return null;
  return {
    ...row,
    is_published: Boolean(Number(row.is_published)),
    pin_version: Boolean(Number(row.pin_version)),
    scanned: false,
    scan_note: 'Files are not malware-scanned in this environment. They stay unpublished until an administrator publishes them.',
  };
}

export async function listEventResources(pool, eventId) {
  const [rows] = await pool.query(
    'SELECT * FROM event_resources WHERE event_id = ? ORDER BY created_at DESC',
    [eventId],
  );
  return (rows || []).map(mapResource);
}

export async function getEventResource(pool, id) {
  const [[row]] = await pool.query('SELECT * FROM event_resources WHERE id = ? LIMIT 1', [id]);
  return mapResource(row);
}

export async function createEventResource(pool, {
  eventId,
  title,
  description = '',
  accessMode = 'registrant_link',
  availableFrom = null,
  availableUntil = null,
  createdBy = null,
}) {
  const id = newCampaignId('eres');
  const mode = accessMode === 'public' ? 'public' : (accessMode === 'verified' ? 'verified' : 'registrant_link');
  if (mode === 'verified') {
    throw new Error('Verified access is not available yet.');
  }
  await pool.query(
    `INSERT INTO event_resources
      (id, event_id, title, description, access_mode, is_published, available_from, available_until, created_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, eventId, String(title || '').trim(), String(description || '').trim(), mode, availableFrom, availableUntil, createdBy],
  );
  return getEventResource(pool, id);
}

export function validateUploadMeta({ originalName, mimeType, byteSize }) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error('That file type is not allowed.');
  if (mimeType && !ALLOWED_MIME.has(String(mimeType))) throw new Error('That file type is not allowed.');
  if (Number(byteSize || 0) > MAX_BYTES) throw new Error('File is larger than 15 MB.');
  if (/\.(exe|html|js|php|sh|bat)$/i.test(originalName || '')) throw new Error('Executable content is not allowed.');
}

export async function addResourceVersion(pool, {
  resource,
  buffer,
  originalName,
  mimeType,
  appRoot,
  externalUrl = '',
}) {
  const versionId = newCampaignId('erv');
  const ext = path.extname(originalName || '').toLowerCase() || '.bin';
  const storedName = `${versionId}${ext}`;
  let kind = 'file';
  let checksum = null;
  let byteSize = 0;
  if (externalUrl) {
    const safe = sanitizeHttpUrl(externalUrl);
    if (!safe) throw new Error('External resource URL must be https.');
    kind = 'link';
    byteSize = 0;
  } else {
    validateUploadMeta({ originalName, mimeType, byteSize: buffer?.length || 0 });
    const root = privateResourceRoot(appRoot);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, storedName), buffer);
    checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    byteSize = buffer.length;
  }
  await pool.query(
    `INSERT INTO event_resource_versions
      (id, resource_id, original_name, stored_name, mime_type, byte_size, checksum_sha256, kind, external_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [versionId, resource.id, originalName || storedName, storedName, mimeType || 'application/octet-stream', byteSize, checksum, kind, externalUrl || null],
  );
  await pool.query('UPDATE event_resources SET current_version_id = ? WHERE id = ?', [versionId, resource.id]);
  return getEventResource(pool, resource.id);
}

export async function setResourcePublished(pool, id, published) {
  await pool.query('UPDATE event_resources SET is_published = ? WHERE id = ?', [published ? 1 : 0, id]);
  return getEventResource(pool, id);
}

export async function issueRegistrantGrant(pool, { resource, registrationId, days = 30 }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const id = newCampaignId('ergr');
  await pool.query(
    `INSERT INTO event_resource_grants
      (id, resource_id, event_id, registration_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [id, resource.id, resource.event_id, registrationId || null, tokenHash, days],
  );
  return { grantId: id, token: raw };
}

export async function resolveResourceAccess(pool, { token, resourceId, method = 'GET' }) {
  const resource = await getEventResource(pool, resourceId);
  if (!resource) return { ok: false, status: 404, message: 'Resource not found.' };
  if (!resource.is_published) return { ok: false, status: 404, message: 'This resource is not published.' };
  if (resource.available_from && new Date(resource.available_from) > new Date()) {
    return { ok: false, status: 403, message: 'This resource is not available yet.' };
  }
  if (resource.available_until && new Date(resource.available_until) < new Date()) {
    return { ok: false, status: 410, message: 'This resource link has expired.' };
  }
  if (resource.access_mode === 'public') {
    return { ok: true, resource, consume: false };
  }
  if (resource.access_mode === 'verified') {
    return { ok: false, status: 403, message: 'Verified access is not available yet.' };
  }
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const [[grant]] = await pool.query(
    'SELECT * FROM event_resource_grants WHERE token_hash = ? AND resource_id = ? LIMIT 1',
    [hash, resourceId],
  );
  if (!grant) return { ok: false, status: 403, message: 'This download link is not valid.' };
  if (grant.revoked_at) return { ok: false, status: 403, message: 'This download link was revoked.' };
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
    return { ok: false, status: 410, message: 'This download link has expired.' };
  }
  if (String(grant.event_id) !== String(resource.event_id)) {
    return { ok: false, status: 403, message: 'This link does not belong to this event.' };
  }
  const consume = method !== 'GET' && method !== 'HEAD';
  if (consume) {
    return { ok: false, status: 405, message: 'Use GET to download this file.' };
  }
  await pool.query(
    'UPDATE event_resource_grants SET last_access_at = NOW() WHERE id = ?',
    [grant.id],
  );
  return { ok: true, resource, grant, consume: false };
}

export async function readResourceFile(pool, resource, appRoot) {
  if (!resource.current_version_id) throw new Error('No file has been uploaded yet.');
  const [[version]] = await pool.query('SELECT * FROM event_resource_versions WHERE id = ? LIMIT 1', [resource.current_version_id]);
  if (!version) throw new Error('File version is missing.');
  if (version.kind === 'link') return { kind: 'link', url: version.external_url };
  const filePath = path.join(privateResourceRoot(appRoot), version.stored_name);
  const buffer = await fs.readFile(filePath);
  return { kind: 'file', buffer, mimeType: version.mime_type, name: version.original_name };
}

export async function revokeRegistrationGrants(pool, { resourceId = null, registrationId = null } = {}) {
  if (resourceId) {
    await pool.query('UPDATE event_resource_grants SET revoked_at = NOW() WHERE resource_id = ? AND revoked_at IS NULL', [resourceId]);
  }
  if (registrationId) {
    await pool.query('UPDATE event_resource_grants SET revoked_at = NOW() WHERE registration_id = ? AND revoked_at IS NULL', [registrationId]);
  }
}
