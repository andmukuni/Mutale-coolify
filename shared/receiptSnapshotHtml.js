import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { renderReceiptMarkup } from './receiptRender.js';

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
      const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mutale-receipt-pdf-'));
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

/** Close shared browser (tests / graceful shutdown). */
export async function closeReceiptPdfBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // ignore close errors
  }
  resetBrowserPromise();
}

/**
 * Render receipt preview HTML to PDF (matches Receipt Preview modal layout).
 * @param {object} viewModel
 * @returns {Promise<Buffer>}
 */
export async function captureViewModelToPdfBuffer(viewModel) {
  const html = renderReceiptMarkup(viewModel, { outerPadding: false });
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
      const root = document.querySelector('[data-receipt-root]');
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
