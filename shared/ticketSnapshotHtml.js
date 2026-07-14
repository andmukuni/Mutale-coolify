import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { renderTicketMarkup } from './ticketRender.js';

let browserPromise = null;

function resetBrowserPromise() {
  browserPromise = null;
}

function usesOnlyInlineAssets(viewModel = {}) {
  const logo = String(viewModel.logoDataUrl || '');
  const qr = String(viewModel.qrDataUrl || '');
  const logoOk = !logo || logo.startsWith('data:') || logo.startsWith('file:');
  const qrOk = !qr || qr.startsWith('data:');
  return logoOk && qrOk;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { default: puppeteer } = await import('puppeteer');
      const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mutale-ticket-pdf-'));
      return puppeteer.launch({
        headless: true,
        userDataDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    })();
    browserPromise.catch(() => {
      resetBrowserPromise();
    });
  }
  return browserPromise;
}

export async function closeTicketPdfBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    //
  }
  resetBrowserPromise();
}

/**
 * @param {object} viewModel
 * @returns {Promise<Buffer>}
 */
export async function captureTicketViewModelToPdfBuffer(viewModel) {
  const html = renderTicketMarkup(viewModel, { outerPadding: false });
  const waitUntil = usesOnlyInlineAssets(viewModel) ? 'load' : 'networkidle0';
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 672, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil });

    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = () => resolve(undefined);
          img.onerror = () => resolve(undefined);
        });
      }));
    });

    const heightPx = await page.evaluate(() => {
      const root = document.querySelector('[data-ticket-root]');
      return root ? Math.ceil(root.getBoundingClientRect().height) : 900;
    });

    const pdfBytes = await page.pdf({
      printBackground: true,
      width: '672px',
      height: `${heightPx}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}
