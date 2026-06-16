import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getBundledReceiptLogoPath,
  loadReceiptLogoDataUrl,
  getReceiptLogoFileUrl,
} from './receiptLogoAsset.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('receiptLogoAsset', () => {
  it('loads bundled logo from shared/assets', async () => {
    const dataUrl = await loadReceiptLogoDataUrl();
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(1000);
  });

  it('exposes a file URL for headless PDF rendering', async () => {
    const fileUrl = await getReceiptLogoFileUrl();
    expect(fileUrl.startsWith('file:')).toBe(true);
    expect(getBundledReceiptLogoPath()).toBe(
      path.join(__dirname, 'assets', 'Logo-Website-Mutale-08.png'),
    );
  });
});
