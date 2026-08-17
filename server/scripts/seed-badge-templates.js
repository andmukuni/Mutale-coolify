/**
 * Seed professional 6×8 name-badge templates for onsite (in-person / hybrid) events.
 *
 * Usage:
 *   node server/scripts/seed-badge-templates.js
 *   node server/scripts/seed-badge-templates.js --all
 *   node server/scripts/seed-badge-templates.js --keep-existing
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from '../db.js';
import {
  buildBadgeDesignFromPreset,
  getBadgePreset,
  isOnsiteEventForBadges,
  pickBadgePresetIdForEvent,
} from '../../shared/badgePresets.js';
import { BADGE_PAPER_SIZE } from '../../shared/certificateDesign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config();

const args = new Set(process.argv.slice(2));
const includeVirtual = args.has('--all');
const keepExisting = args.has('--keep-existing');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS badge_templates (
      id VARCHAR(90) PRIMARY KEY,
      event_id VARCHAR(90) NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'Name Badge',
      design_json LONGTEXT NOT NULL,
      background_image VARCHAR(500) NULL,
      orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
      paper_size VARCHAR(20) NOT NULL DEFAULT '6x8',
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      created_by VARCHAR(90) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_badge_templates_event (event_id),
      INDEX idx_badge_templates_active (is_active)
    )
  `);
}

async function upsertTemplate(event, presetId) {
  const preset = getBadgePreset(presetId);
  const design = buildBadgeDesignFromPreset(presetId, event);
  const title = `${preset.defaultTitle} — ${event.title}`;
  const id = `badge-tpl-${event.id}`.slice(0, 90);

  await pool.query(
    `INSERT INTO badge_templates (
      id, event_id, title, design_json, orientation, paper_size, is_active, created_by
    ) VALUES (?, ?, ?, ?, 'portrait', ?, 1, NULL)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      design_json = VALUES(design_json),
      orientation = 'portrait',
      paper_size = VALUES(paper_size),
      is_active = 1,
      updated_at = NOW()`,
    [id, event.id, title, JSON.stringify(design), BADGE_PAPER_SIZE],
  );

  return { preset, title };
}

async function main() {
  await ensureTable();

  const [events] = await pool.query(
    `SELECT id, title, slug, event_mode, location, venue, category,
            start_date, end_date, start_time, end_time
     FROM events
     ORDER BY start_date ASC, title ASC`,
  );

  const targets = includeVirtual
    ? events
    : events.filter((event) => isOnsiteEventForBadges(event));

  if (!targets.length) {
    console.log(includeVirtual
      ? 'No events found.'
      : 'No in-person or hybrid events found. Re-run with --all to include virtual events.');
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  console.log(`Seeding professional badge templates for ${targets.length} event(s)…`);
  console.log('');

  for (let i = 0; i < targets.length; i += 1) {
    const event = targets[i];
    const [[existing]] = await pool.query(
      'SELECT id FROM badge_templates WHERE event_id = ? LIMIT 1',
      [event.id],
    );

    if (existing && keepExisting) {
      skipped += 1;
      console.log(`  skip  ${event.title}`);
      continue;
    }

    const presetId = pickBadgePresetIdForEvent(event, i);
    const { preset } = await upsertTemplate(event, presetId);
    if (existing) updated += 1;
    else created += 1;
    console.log(`  ${preset.name.padEnd(16)}  ${event.title}`);
  }

  console.log('');
  console.log(`Done. created ${created}, updated ${updated}, skipped ${skipped}.`);
  console.log('Templates are published (active). Print 2 badges per A4 from the event Badges tab.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
