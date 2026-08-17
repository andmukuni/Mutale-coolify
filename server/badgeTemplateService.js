import crypto from 'crypto';
import {
  parseDesignJson,
  validateDesignForPublish,
  syncDesignCanvas,
  BADGE_PAPER_SIZE,
} from '../shared/certificateDesign.js';
import {
  buildBadgeDesignFromPreset,
  pickBadgePresetIdForEvent,
  getBadgePreset,
} from '../shared/badgePresets.js';
import { generateBadgePrintSheetPdf } from '../shared/badgePdf.js';

export function mapDbBadgeTemplate(row) {
  if (!row) return null;
  const design = parseDesignJson(row.design_json);
  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    design_json: design,
    background_image: row.background_image || '',
    orientation: row.orientation || 'portrait',
    paper_size: row.paper_size || BADGE_PAPER_SIZE,
    is_active: Boolean(row.is_active),
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getBadgeTemplateForEvent(pool, eventId) {
  const [[row]] = await pool.query(
    'SELECT * FROM badge_templates WHERE event_id = ? LIMIT 1',
    [eventId],
  );
  return row ? mapDbBadgeTemplate(row) : null;
}

export async function activateOrCreateBadgeTemplate(pool, eventId, adminUserId, eventRow) {
  const existing = await getBadgeTemplateForEvent(pool, eventId);
  if (existing) {
    return { template: existing, created: false };
  }

  const id = `badge-tpl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const presetId = pickBadgePresetIdForEvent(eventRow || {});
  const preset = getBadgePreset(presetId);
  const design = buildBadgeDesignFromPreset(presetId, eventRow || {}, {
    orientation: 'portrait',
    paperSize: BADGE_PAPER_SIZE,
  });
  const title = `${preset.defaultTitle} — ${String(eventRow?.title || 'Event')}`;

  await pool.query(
    `INSERT INTO badge_templates (
      id, event_id, title, design_json, orientation, paper_size, is_active, created_by
    ) VALUES (?, ?, ?, ?, 'portrait', ?, 0, ?)`,
    [id, eventId, title, JSON.stringify(design), BADGE_PAPER_SIZE, adminUserId || null],
  );

  const template = await getBadgeTemplateForEvent(pool, eventId);
  return { template, created: true };
}

async function persistDesignImages(design, persistImage) {
  if (!design || !Array.isArray(design.elements) || !persistImage) return design;
  const elements = [...design.elements];
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (el.type === 'image' && el.src && String(el.src).startsWith('data:')) {
      elements[i] = { ...el, src: await persistImage(el.src) };
    }
  }
  return { ...design, elements };
}

export async function saveBadgeTemplateDraft(pool, eventId, payload, { persistImage } = {}) {
  const template = await getBadgeTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Badge template not found. Activate badge designer first.' };
  }

  const orientation = 'portrait';
  const paperSize = BADGE_PAPER_SIZE;
  const title = String(payload.title || template.title || 'Name Badge').trim();

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
    `UPDATE badge_templates SET
      title = ?, design_json = ?, background_image = ?, orientation = ?, paper_size = ?, updated_at = NOW()
     WHERE event_id = ?`,
    [title, JSON.stringify(design), backgroundImage || null, orientation, paperSize, eventId],
  );

  const updated = await getBadgeTemplateForEvent(pool, eventId);
  return { ok: true, template: updated };
}

export async function publishBadgeTemplate(pool, eventId) {
  const template = await getBadgeTemplateForEvent(pool, eventId);
  if (!template) {
    return { ok: false, message: 'Badge template not found.' };
  }

  const validation = validateDesignForPublish(template.design_json, template);
  if (!validation.ok) {
    return { ok: false, message: validation.errors[0], errors: validation.errors };
  }

  await pool.query(
    'UPDATE badge_templates SET is_active = 1, updated_at = NOW() WHERE event_id = ?',
    [eventId],
  );

  const updated = await getBadgeTemplateForEvent(pool, eventId);
  return { ok: true, template: updated };
}

export async function generateBadgeTemplatePreviewPdf(pool, eventId, appRoot, appOrigin) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) return { ok: false, message: 'Event not found.' };

  const template = await getBadgeTemplateForEvent(pool, eventId);
  if (!template) return { ok: false, message: 'Badge template not found.' };

  const samples = [
    {
      booked_for_name: 'Jane M. Sample',
      user_name: 'MUTALE MUBANGA',
      reference_code: 'MM-20260813-4821',
    },
    {
      booked_for_name: 'Chile',
      user_name: 'MUTALE MUBANGA',
      reference_code: 'REG-SAMPLE-RB6JQ5',
    },
  ];
  const buffer = await generateBadgePrintSheetPdf(template, samples, {
    event,
    appRoot,
    appOrigin,
  });
  return { ok: true, buffer, filename: `Badge-Preview-A4-${eventId}.pdf` };
}

export async function generateEventBadgePrintPdf(pool, eventId, appRoot, appOrigin, { registrationIds = [] } = {}) {
  const [[event]] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) return { ok: false, message: 'Event not found.' };

  const template = await getBadgeTemplateForEvent(pool, eventId);
  if (!template) return { ok: false, message: 'Badge template not found. Design badges first.' };

  let rows;
  if (Array.isArray(registrationIds) && registrationIds.length > 0) {
    const placeholders = registrationIds.map(() => '?').join(', ');
    [rows] = await pool.query(
      `SELECT * FROM event_registrations WHERE event_id = ? AND id IN (${placeholders}) AND status <> 'cancelled' ORDER BY registered_at ASC`,
      [eventId, ...registrationIds],
    );
  } else {
    [rows] = await pool.query(
      `SELECT * FROM event_registrations WHERE event_id = ? AND status <> 'cancelled' ORDER BY registered_at ASC`,
      [eventId],
    );
  }

  if (!rows.length) {
    return { ok: false, message: 'No registrations found for badge export.' };
  }

  const buffer = await generateBadgePrintSheetPdf(template, rows, {
    event,
    appRoot,
    appOrigin,
  });
  return { ok: true, buffer, filename: `Badges-${event.slug || eventId}.pdf`, count: rows.length };
}
