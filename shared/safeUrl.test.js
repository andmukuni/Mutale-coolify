import { describe, it, expect } from 'vitest';
import { safeExternalUrl } from './safeUrl.js';

describe('safeExternalUrl', () => {
  it('allows https URLs', () => {
    expect(safeExternalUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('rejects javascript URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects empty input', () => {
    expect(safeExternalUrl('')).toBe('');
  });
});
