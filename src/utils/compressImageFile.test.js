import { describe, expect, it } from 'vitest';
import { compressImageFile } from './compressImageFile.js';

describe('compressImageFile', () => {
  it('returns non-image files unchanged', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(compressImageFile(file)).resolves.toBe(file);
  });
});
