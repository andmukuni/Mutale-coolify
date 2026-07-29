import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Launch options for ticket/receipt HTML → PDF (Docker Coolify uses system Chromium).
 * @param {string} tmpPrefix
 */
export async function buildPuppeteerLaunchOptions(tmpPrefix = 'mutale-pdf-') {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), tmpPrefix));
  const executablePath = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim() || undefined;
  return {
    headless: true,
    userDataDir,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
}
