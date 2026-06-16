/**
 * Merge production-critical env vars into .env at repo root (next to package.json).
 * Run: node scripts/fix-deployment.mjs [--domain=mutalemubanga.org]
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

let domainOpt = '';
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--domain=')) domainOpt = arg.slice('--domain='.length).trim();
}

function getKey(content, key) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim();
  }
  return '';
}

function setOrReplace(content, key, value) {
  const lines = content.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`) || line.startsWith(`${key} =`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    const trimmed = content.replace(/\s*$/, '');
    const prefix = trimmed ? `${trimmed}\n` : '';
    return `${prefix}${key}=${value}\n`;
  }
  return `${next.join('\n').replace(/\s*$/, '\n')}`;
}

function isEmptySecret(v) {
  return !String(v ?? '').trim();
}

let raw = '';
if (fs.existsSync(envPath)) {
  raw = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(examplePath)) {
  raw = fs.readFileSync(examplePath, 'utf8');
}

let secret =
  !isEmptySecret(getKey(raw, 'JWT_SECRET')) ? getKey(raw, 'JWT_SECRET')
    : !isEmptySecret(getKey(raw, 'AUTH_TOKEN_SECRET')) ? getKey(raw, 'AUTH_TOKEN_SECRET')
      : '';

if (isEmptySecret(secret)) {
  secret = crypto.randomBytes(32).toString('hex');
  console.log('[fix-deployment] Generated new JWT_SECRET / AUTH_TOKEN_SECRET (save this copy of .env securely).');
}

raw = setOrReplace(raw, 'JWT_SECRET', secret);
raw = setOrReplace(raw, 'AUTH_TOKEN_SECRET', secret);

if (domainOpt) {
  const normalized = domainOpt.replace(/\/+$/, '');
  let origin = normalized.includes('://') ? normalized : `https://${normalized}`;
  try {
    const u = new URL(origin);
    const host = u.host;
    const origins = new Set([`${u.protocol}//${host}`]);
    if (!host.startsWith('www.')) origins.add(`${u.protocol}//www.${host}`);
    else origins.add(`${u.protocol}//${host.replace(/^www\./, '')}`);
    raw = setOrReplace(raw, 'APP_URL', origin);
    raw = setOrReplace(raw, 'CORS_ORIGINS', [...origins].join(','));
    raw = setOrReplace(raw, 'RECEIPT_PDF_LEGACY', '1');
    console.log(`[fix-deployment] APP_URL=${origin}`);
    console.log(`[fix-deployment] CORS_ORIGINS=${[...origins].join(',')}`);
    console.log('[fix-deployment] RECEIPT_PDF_LEGACY=1 (jsPDF receipts for cPanel)');
  } catch {
    console.error('[fix-deployment] Invalid --domain=', domainOpt);
    process.exit(1);
  }
}

fs.writeFileSync(envPath, raw, 'utf8');
console.log(`[fix-deployment] Wrote ${path.relative(process.cwd(), envPath)}`);
console.log('[fix-deployment] For cPanel: upload this .env beside app.js OR paste JWT_SECRET into Node App → Environment Variables, then Restart.');
