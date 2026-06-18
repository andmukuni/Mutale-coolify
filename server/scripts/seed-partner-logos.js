/**
 * Demo seeder for home-page partner logos.
 *
 * Generates simple, self-contained SVG wordmark logos into
 * `uploads/partners/` and points each partner_logos row at them.
 *
 * Usage: npm run seed:partner-logos
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(APP_ROOT, 'uploads', 'partners');

// Demo brand-ish styling per partner (color is decorative only).
const PARTNERS = [
  { id: 'pl_africa_cdc', name: 'Africa CDC', initials: 'CDC', color: '#1b7f4b', website_url: 'https://africacdc.org' },
  { id: 'pl_cidrz', name: 'CIDRZ', initials: 'CIDRZ', color: '#1d4ed8', website_url: 'https://www.cidrz.org' },
  { id: 'pl_find', name: 'FIND', initials: 'FIND', color: '#0d9488', website_url: 'https://www.finddx.org' },
  { id: 'pl_who', name: 'WHO', initials: 'WHO', color: '#0a5ca8', website_url: 'https://www.who.int' },
  { id: 'pl_aslm', name: 'ASLM', initials: 'ASLM', color: '#ea580c', website_url: 'https://aslm.org' },
  { id: 'pl_moh_zambia', name: 'Ministry of Health', initials: 'MoH', color: '#15803d', website_url: 'https://www.moh.gov.zm' },
  { id: 'pl_hpcz', name: 'HPCZ', initials: 'HPCZ', color: '#1e293b', website_url: 'https://www.hpcz.org.zm' },
];

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function buildSvg({ name, initials, color }) {
  const safeName = escapeXml(name);
  const safeInitials = escapeXml(initials);
  // Logo-only mark: a centered rounded badge with the partner initials.
  // No wordmark/subtitle — the section shows the logo only.
  const fontSize = safeInitials.length > 3 ? 30 : 38;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120" role="img" aria-label="${safeName}">
  <rect x="20" y="20" width="120" height="80" rx="18" fill="${color}"/>
  <text x="80" y="60" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="1" fill="#ffffff">${safeInitials}</text>
</svg>
`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let updated = 0;
  for (const partner of PARTNERS) {
    const svg = buildSvg(partner);
    // Version filename by content hash so updates bypass the browser cache.
    const hash = crypto.createHash('md5').update(svg).digest('hex').slice(0, 8);

    // Remove any earlier generations for this partner.
    for (const existing of fs.readdirSync(OUT_DIR)) {
      if (existing.startsWith(`${partner.id}.`) || existing.startsWith(`${partner.id}-`)) {
        try { fs.unlinkSync(path.join(OUT_DIR, existing)); } catch { /* noop */ }
      }
    }

    const fileName = `${partner.id}.${hash}.svg`;
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, svg, 'utf8');

    const logoUrl = `/uploads/partners/${fileName}`;
    const [result] = await pool.query(
      `INSERT INTO partner_logos (id, name, logo_url, website_url, is_active, sort_order)
       VALUES (?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), website_url = VALUES(website_url), is_active = 1`,
      [partner.id, partner.name, logoUrl, partner.website_url, 100],
    );
    updated += result.affectedRows ? 1 : 0;
    console.log(`  ✓ ${partner.name} -> ${logoUrl}`);
  }

  console.log(`\n[partner-logos] Seeded ${PARTNERS.length} demo logos (${updated} rows written).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[partner-logos] Seed failed:', err.message);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
