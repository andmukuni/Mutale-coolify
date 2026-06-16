import crypto from 'crypto';
import {
  buildDefaultCertificateDesign,
  parseDesignJson,
  validateDesignForPublish,
  buildSamplePreviewData,
  formatEventDateRange,
  syncDesignCanvas,
} from '../shared/certificateDesign.js';
import { generateCertificatePdfFromTemplate } from '../shared/certificatePdf.js';

export function mapDbTemplate(row) {
  if (!row) return null;
  let design = parseDesignJson(row.design_json);
  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    design_json: design,
    background_image: row.background_image || '',
    orientation: row.orientation || 'landscape',
    paper_size: row.paper_size || 'A4',
    is_active: Boolean(row.is_active),
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getTemplateForEvent(pool, eventId) {
  const [[row]] = await pool.query(
    'SELECT * FROM certificate_templates WHERE event_id = ? LIMIT 1',
    [eventId],
  );
  return row ? mapDbTemplate(row) : null;
}

export async function getActiveTemplateForEvent(pool, eventId) {
  const [[row]] = await pool.query(
    'SELECT * FROM certificate_templates WHERE event_id = ? AND is_active = 1 LIMIT 1',
    [eventId],
  );
  return row ? mapDbTemplate(row) : null;
}

export async function activateOrCreateTemplate(pool, eventId, adminUserId, eventRow) {
  const existing = await getTemplateForEvent(pool, eventId);
  if (existing) {
    return { template: existing, created: false };
  }

  const id = `cert-tpl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const design = buildDefaultCertificateDesign(eventRow || {}, {
    orientation: 'landscape',
    paperSize: 'A4',
  });
  const title = `Certificate of Attendance — ${String(eventRow?.title || 'Event')}`;

  await pool.query(
    `INSERT INTO certificate_templates (
      id, event_id, title, design_json, orientation, paper_size, is_active, created_by
    ) VALUES (?, ?, ?, ?, 'landscape', 'A4', 0, ?)`,
    [id, eventId, title, JSON.stringify(design), adminUserId || null],
  );

  const template = await getTemplateForEvent(pool, eventId);
  return { template, created: true };
}

async function persistDesignImages(design, persistImage) {
  if (!design || !Array.isArray(design.elements) || !persistImage) return design;

  const elements = [...design.elements];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'image' && el.src && String(el.src).startsWith('data:')) {
      elements[i] = { ...el, src: await persistImage(el.src) };
    }
  }
  return { ...design, elements };
}

export async function saveTemplateDraft(pool, eventId, payload, { persistImage } = {}) {
  const template = await getTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Certificate template not found. Activate certificate first.' };
  }

  const orientation = payload.orientation === 'portrait' ? 'portrait' : 'landscape';
  const paperSize = String(payload.paper_size || 'A4').toUpperCase() === 'A4' ? 'A4' : 'A4';
  const title = String(payload.title || template.title || 'Certificate of Attendance').trim();

  let design = parseDesignJson(payload.design_json) || template.design_json;
  design = syncDesignCanvas(design, orientation, paperSize);
  design = await persistDesignImages(design, persistImage);

  let backgroundImage = payload.background_image;
  if (backgroundImage !== undefined) {
    if (backgroundImage && String(backgroundImage).startsWith('data:') && persistImage) {
      backgroundImage = await persistImage(backgroundImage);
    }
  } else {
    backgroundImage = template.background_image;
  }

  await pool.query(
    `UPDATE certificate_templates SET
      title = ?, design_json = ?, background_image = ?, orientation = ?, paper_size = ?, updated_at = NOW()
     WHERE event_id = ?`,
    [title, JSON.stringify(design), backgroundImage || null, orientation, paperSize, eventId],
  );

  const updated = await getTemplateForEvent(pool, eventId);
  return { ok: true, template: updated };
}

export async function publishTemplate(pool, eventId) {
  const template = await getTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Certificate template not found.' };
  }

  const validation = validateDesignForPublish(template.design_json, template);
  if (!validation.ok) {
    return { ok: false, message: validation.errors[0], errors: validation.errors };
  }

  await pool.query(
    'UPDATE certificate_templates SET is_active = 1, updated_at = NOW() WHERE event_id = ?',
    [eventId],
  );

  const updated = await getTemplateForEvent(pool, eventId);
  return { ok: true, template: updated };
}

export async function deactivateTemplate(pool, eventId) {
  const template = await getTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Certificate template not found.' };
  }

  await pool.query(
    'UPDATE certificate_templates SET is_active = 0, updated_at = NOW() WHERE event_id = ?',
    [eventId],
  );

  const updated = await getTemplateForEvent(pool, eventId);
  return { ok: true, template: updated };
}

export function buildSamplePreviewDataForEvent(event) {
  return buildSamplePreviewData(event, {
    event_date: formatEventDateRange(event),
    event_name: String(event?.title || 'Sample Event'),
  });
}

export async function generateTemplatePreviewPdf(pool, eventId, appRoot, appOrigin) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) {
    return { ok: false, message: 'Event not found.' };
  }

  const template = await getTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Certificate template not found.' };
  }

  const data = buildSamplePreviewDataForEvent(event);
  const buffer = await generateCertificatePdfFromTemplate(template, data, {
    appRoot,
    appOrigin,
  });

  return { ok: true, buffer, filename: `Certificate-Preview-${eventId}.pdf` };
}

export async function eventHasActiveTemplate(pool, eventId) {
  const [[row]] = await pool.query(
    'SELECT id FROM certificate_templates WHERE event_id = ? AND is_active = 1 LIMIT 1',
    [eventId],
  );
  return Boolean(row?.id);
}
