/**
 * Automated Daily.co integration smoke test.
 * Usage: node server/scripts/test-daily-integration.js
 * Optional env: DAILY_API_KEY, DAILY_DOMAIN (overrides DB settings for live API test)
 * Optional: API_BASE=http://localhost:4000
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(appRoot, '.env') });

const API_BASE = String(process.env.API_BASE || 'http://localhost:4000').replace(/\/$/, '');

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function loadDailyConfigFromDb() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mutale',
  });
  try {
    const [[row]] = await pool.query('SELECT data FROM system_settings WHERE id = 1');
    const data = typeof row?.data === 'string' ? JSON.parse(row.data) : (row?.data || {});
    return {
      apiKey: String(process.env.DAILY_API_KEY || data.daily?.apiKey || '').trim(),
      domain: String(process.env.DAILY_DOMAIN || data.daily?.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
    };
  } finally {
    await pool.end();
  }
}

async function testDailyJsPackage() {
  try {
    const mod = await import('@daily-co/daily-js');
    const Daily = mod.default || mod;
    const hasCreateFrame = typeof Daily?.createFrame === 'function';
    const hasIframe = typeof Daily?.wrap === 'function' || hasCreateFrame;
    record('@daily-co/daily-js package', hasCreateFrame, hasCreateFrame ? 'createFrame available' : 'missing createFrame');
    return hasCreateFrame;
  } catch (error) {
    record('@daily-co/daily-js package', false, error.message);
    return false;
  }
}

async function testApiServerReachable() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const json = await res.json();
    record('API server health', res.ok && json.ok === true, API_BASE);
    return res.ok;
  } catch (error) {
    record('API server health', false, `${API_BASE} — ${error.message}`);
    return false;
  }
}

async function testVideoStatusEndpoint() {
  try {
    const res = await fetch(`${API_BASE}/api/settings/video/status`);
    const json = await res.json();
    const ok = res.ok && json.ok && json.providers?.daily && json.providers?.zoom;
    record(
      'GET /api/settings/video/status',
      ok,
      ok ? `default=${json.defaultProvider}` : JSON.stringify(json).slice(0, 120),
    );
    return { ok, json };
  } catch (error) {
    record('GET /api/settings/video/status', false, error.message);
    return { ok: false, json: null };
  }
}

async function testDailySettingsEndpoint(config) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const adminKey = String(process.env.ADMIN_API_KEY || '').trim();
    if (adminKey) headers['x-admin-api-key'] = adminKey;

    const res = await fetch(`${API_BASE}/api/settings/daily/test`, { method: 'POST', headers });
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      record(
        'POST /api/settings/daily/test',
        true,
        'route protected (admin only); use Test button in Settings or set ADMIN_API_KEY for CLI',
      );
      return { skipped: true, ok: true };
    }
    if (res.status === 400 && /missing/i.test(String(json.message || ''))) {
      record('POST /api/settings/daily/test', true, `reachable: ${json.message}`);
      return { skipped: true, ok: true };
    }
    const ok = res.ok && json.ok;
    record(
      'POST /api/settings/daily/test',
      ok,
      ok ? json.message : `${res.status} ${json.message || json.error || ''}`,
    );
    return { skipped: !config.apiKey, ok: ok || !config.apiKey };
  } catch (error) {
    record('POST /api/settings/daily/test', false, error.message);
    return { skipped: false, ok: false };
  }
}

async function testDailyRestApiLive(config) {
  if (!config.apiKey || !config.domain) {
    record('Daily REST API (live)', true, 'skipped — set API key + domain in Settings or DAILY_* env vars');
    return true;
  }

  const roomName = `mutale-test-${Date.now()}`.slice(0, 40);
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const createRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: { max_participants: 5, exp: Math.floor(Date.now() / 1000) + 3600 },
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      record('Daily REST API (live)', false, `create room: ${createJson.error || createJson.info || createRes.status}`);
      return false;
    }

    const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: 'test-user',
          user_name: 'Integration Test',
          exp: Math.floor(Date.now() / 1000) + 600,
        },
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.token) {
      record('Daily REST API (live)', false, `meeting token: ${tokenJson.error || tokenRes.status}`);
      return false;
    }

    await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

    record(
      'Daily REST API (live)',
      true,
      `room + token OK (domain ${config.domain}, room ${roomName})`,
    );
    return true;
  } catch (error) {
    record('Daily REST API (live)', false, error.message);
    return false;
  }
}

async function testJoinAuthRouteExists() {
  try {
    const res = await fetch(`${API_BASE}/api/events/test-event-id/video/join-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const expects401 = res.status === 401;
    record(
      'POST /api/events/:id/video/join-auth route',
      expects401,
      expects401 ? 'returns 401 without auth (route registered)' : `unexpected HTTP ${res.status}`,
    );
    return expects401;
  } catch (error) {
    record('POST /api/events/:id/video/join-auth route', false, error.message);
    return false;
  }
}

async function main() {
  console.log('\nDaily.co integration smoke test\n');

  await testDailyJsPackage();
  const serverUp = await testApiServerReachable();
  if (serverUp) {
    await testVideoStatusEndpoint();
    const configPreview = await loadDailyConfigFromDb();
    await testDailySettingsEndpoint(configPreview);
    await testJoinAuthRouteExists();
  } else {
    record('Daily API routes', false, 'start server: npm run server:start');
  }

  const config = await loadDailyConfigFromDb();
  await testDailyRestApiLive(config);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.\n`);

  if (failed.length) {
    console.log('Failed checks:');
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  const liveSkipped = !config.apiKey || !config.domain;
  if (liveSkipped) {
    console.log('Note: Live Daily API test was skipped. Add credentials in Admin → Video Meetings → Daily.co Setup, then re-run.\n');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
