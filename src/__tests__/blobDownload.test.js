import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from '../utils/blobDownload.js';

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('throws when blob is empty', () => {
    expect(() => downloadBlob(new Blob([], { type: 'application/pdf' }), 'test.pdf'))
      .toThrow(/empty or invalid/i);
  });

  it('throws when blob is too small', () => {
    const tiny = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });
    expect(() => downloadBlob(tiny, 'test.pdf')).toThrow(/empty or invalid/i);
  });

  it('creates anchor download for valid PDF blob', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const bytes = new Uint8Array(600);
    bytes.set([37, 80, 68, 70, 45, 49, 46, 33]);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'Receipt-MM-DEMO.pdf');
    expect(appendSpy).toHaveBeenCalled();
    appendSpy.mockRestore();
  });
});
