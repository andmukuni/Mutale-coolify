import {
  SYSTEM_NOTIFICATION_TEMPLATES,
  getSystemTemplate,
  isSystemTemplate,
  normalizeTemplateChannel,
  renderTemplate,
  slugifyTemplate,
  systemTemplateKey,
} from '../shared/notificationTemplates.js';

function newTemplateId(prefix = 'ntpl') {
  const random = Math.random().toString(36).slice(2, 10).toLowerCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function extractPlaceholderKeys(...texts) {
  const keys = new Set();
  for (const text of texts) {
    for (const match of String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

function mapTemplateRow(row, { includeDefault = true } = {}) {
  if (!row) return null;
  const channel = normalizeTemplateChannel(row.channel);
  const slug = String(row.slug || '').trim();
  const catalog = getSystemTemplate(slug, channel);
  const system = Boolean(row.is_system) || Boolean(catalog);
  return {
    id: row.id,
    slug,
    channel,
    name: row.name || catalog?.name || slug,
    description: row.description || catalog?.description || '',
    subject: row.subject || '',
    body: row.body || '',
    is_system: system,
    enabled: row.enabled === undefined ? true : Boolean(Number(row.enabled)),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    default_subject: includeDefault ? (catalog?.subject || '') : undefined,
    default_body: includeDefault ? (catalog?.body || '') : undefined,
    placeholders: extractPlaceholderKeys(
      catalog?.subject || row.subject,
      catalog?.body || row.body,
    ),
  };
}

export async function ensureNotificationTemplateTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id VARCHAR(80) PRIMARY KEY,
      slug VARCHAR(80) NOT NULL,
      channel VARCHAR(12) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(400) NULL,
      subject VARCHAR(250) NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notification_templates_slug_channel (slug, channel),
      INDEX idx_notification_templates_channel (channel)
    )
  `);
}

export async function seedSystemNotificationTemplates(pool) {
  await ensureNotificationTemplateTable(pool);
  for (const item of SYSTEM_NOTIFICATION_TEMPLATES) {
    const id = `ntpl-${item.channel}-${item.slug}`.slice(0, 80);
    try {
      await pool.query(
        `INSERT INTO notification_templates
          (id, slug, channel, name, description, subject, body, is_system, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE
           name = IF(name = '' OR name IS NULL, VALUES(name), name),
           description = IF(description = '' OR description IS NULL, VALUES(description), description)`,
        [id, item.slug, item.channel, item.name, item.description, item.subject || '', item.body || ''],
      );
    } catch (error) {
      console.warn(`[notification_templates seed] ${item.slug}/${item.channel}: ${error.message}`);
    }
  }
}

export async function listNotificationTemplates(pool, { channel } = {}) {
  await seedSystemNotificationTemplates(pool);
  const normalized = channel ? normalizeTemplateChannel(channel) : '';
  const [rows] = normalized
    ? await pool.query(
      'SELECT * FROM notification_templates WHERE channel = ? ORDER BY is_system DESC, name ASC',
      [normalized],
    )
    : await pool.query('SELECT * FROM notification_templates ORDER BY channel ASC, is_system DESC, name ASC');
  const seen = new Set();
  const mapped = (rows || []).map((row) => {
    const item = mapTemplateRow(row);
    seen.add(systemTemplateKey(item.slug, item.channel));
    return item;
  });
  for (const catalog of SYSTEM_NOTIFICATION_TEMPLATES) {
    const key = systemTemplateKey(catalog.slug, catalog.channel);
    if (seen.has(key)) continue;
    if (normalized && catalog.channel !== normalized) continue;
    mapped.push(mapTemplateRow({
      id: `ntpl-${catalog.channel}-${catalog.slug}`,
      ...catalog,
      is_system: 1,
      enabled: 1,
    }));
  }
  return mapped;
}

export async function getNotificationTemplateById(pool, id) {
  const [[row]] = await pool.query('SELECT * FROM notification_templates WHERE id = ? LIMIT 1', [id]);
  return mapTemplateRow(row);
}

export async function getNotificationTemplateBySlug(pool, slug, channel) {
  const normalized = normalizeTemplateChannel(channel);
  const [[row]] = await pool.query(
    'SELECT * FROM notification_templates WHERE slug = ? AND channel = ? LIMIT 1',
    [String(slug || '').trim(), normalized],
  );
  if (row) return mapTemplateRow(row);
  const catalog = getSystemTemplate(slug, normalized);
  if (!catalog) return null;
  return mapTemplateRow({
    id: `ntpl-${catalog.channel}-${catalog.slug}`,
    ...catalog,
    is_system: 1,
    enabled: 1,
  });
}

function normalizePayload(payload = {}, { existing = null } = {}) {
  const channel = normalizeTemplateChannel(payload.channel || existing?.channel);
  const name = String(payload.name || existing?.name || '').trim();
  const slug = slugifyTemplate(payload.slug || existing?.slug || name);
  if (!name) throw new Error('Template name is required.');
  if (!slug) throw new Error('Template slug is required.');
  const subject = channel === 'email' ? String(payload.subject ?? existing?.subject ?? '').trim() : '';
  const body = String(payload.body ?? existing?.body ?? '');
  if (!String(body).trim()) throw new Error('Template body is required.');
  return {
    slug,
    channel,
    name,
    description: String(payload.description ?? existing?.description ?? '').trim(),
    subject,
    body,
    enabled: payload.enabled === false || payload.enabled === 0 || payload.enabled === '0' ? 0 : 1,
  };
}

export async function createNotificationTemplate(pool, payload = {}) {
  const data = normalizePayload(payload);
  if (isSystemTemplate(data.slug, data.channel)) {
    throw new Error('That slug is reserved for a system template. Edit the existing one instead.');
  }
  const id = newTemplateId();
  try {
    await pool.query(
      `INSERT INTO notification_templates
        (id, slug, channel, name, description, subject, body, is_system, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, data.slug, data.channel, data.name, data.description, data.subject, data.body, data.enabled],
    );
  } catch (error) {
    if (String(error?.code || '') === 'ER_DUP_ENTRY') {
      throw new Error('A template with this slug and channel already exists.');
    }
    throw error;
  }
  return getNotificationTemplateById(pool, id);
}

export async function updateNotificationTemplate(pool, id, payload = {}) {
  const existing = await getNotificationTemplateById(pool, id);
  if (!existing) throw new Error('Template not found.');
  const data = normalizePayload(payload, { existing });
  if (existing.is_system) {
    data.slug = existing.slug;
    data.channel = existing.channel;
  }
  await pool.query(
    `UPDATE notification_templates
     SET slug = ?, channel = ?, name = ?, description = ?, subject = ?, body = ?, enabled = ?
     WHERE id = ?`,
    [data.slug, data.channel, data.name, data.description, data.subject, data.body, data.enabled, id],
  );
  return getNotificationTemplateById(pool, id);
}

export async function resetNotificationTemplate(pool, id) {
  const existing = await getNotificationTemplateById(pool, id);
  if (!existing) throw new Error('Template not found.');
  const catalog = getSystemTemplate(existing.slug, existing.channel);
  if (!catalog) throw new Error('Only system templates can be reset.');
  await pool.query(
    `UPDATE notification_templates
     SET name = ?, description = ?, subject = ?, body = ?, enabled = 1
     WHERE id = ?`,
    [catalog.name, catalog.description, catalog.subject || '', catalog.body || '', id],
  );
  return getNotificationTemplateById(pool, id);
}

export async function deleteNotificationTemplate(pool, id) {
  const existing = await getNotificationTemplateById(pool, id);
  if (!existing) throw new Error('Template not found.');
  if (existing.is_system) throw new Error('System templates cannot be deleted.');
  await pool.query('DELETE FROM notification_templates WHERE id = ?', [id]);
  return true;
}

export async function renderNotification(pool, { slug, channel, vars = {} } = {}) {
  const catalog = getSystemTemplate(slug, channel);
  let subject = catalog?.subject || '';
  let body = catalog?.body || '';
  if (pool) {
    try {
      const stored = await getNotificationTemplateBySlug(pool, slug, channel);
      if (stored?.enabled !== false) {
        if (stored?.subject != null && stored.subject !== '') subject = stored.subject;
        if (stored?.body) body = stored.body;
      }
    } catch (error) {
      console.warn(`[notification_templates] render lookup failed: ${error.message}`);
    }
  }
  return {
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
  };
}

export async function applyNotificationTemplates(pool, {
  slug,
  vars = {},
  subject,
  text,
  smsMessage,
} = {}) {
  const out = { subject, text, smsMessage };
  if (!slug) return out;
  try {
    const sms = await renderNotification(pool, { slug, channel: 'sms', vars });
    if (sms.body) out.smsMessage = sms.body;
    const email = await renderNotification(pool, { slug, channel: 'email', vars });
    if (email.subject) out.subject = email.subject;
    if (email.body) out.text = email.body;
  } catch (error) {
    console.warn(`[notification_templates] apply failed: ${error.message}`);
  }
  return out;
}
