import { describe, expect, it, vi } from 'vitest';
import {
  EVENT_COVER_MAX_WIDTH,
  EVENT_COVER_MAX_HEIGHT,
  EVENT_COVER_MAX_BYTES,
} from './prepareEventCoverImage.js';

vi.mock('./compressImageFile.js', () => ({
  compressImageFile: vi.fn(async (file, opts) => {
    opts?.onProgress?.(50);
    opts?.onProgress?.(100);
    return file;
  }),
}));

vi.mock('./uploadBlogImage.js', () => ({
  readFileAsDataUrl: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}));

describe('prepareEventCoverImage constants', () => {
  it('uses recommended 16:9 cover dimensions', () => {
    expect(EVENT_COVER_MAX_WIDTH).toBe(1200);
    expect(EVENT_COVER_MAX_HEIGHT).toBe(630);
    expect(EVENT_COVER_MAX_BYTES).toBeLessThanOrEqual(2.5 * 1024 * 1024);
  });
});

describe('prepareEventCoverImage', () => {
  it('returns optimized data URL with progress callbacks', async () => {
    const { prepareEventCoverImage } = await import('./prepareEventCoverImage.js');
    const progress = [];
    const file = new File(['x'], 'cover.png', { type: 'image/png' });

    const result = await prepareEventCoverImage(file, {
      onProgress: (value) => progress.push(value),
    });

    expect(result.dataUrl).toContain('data:image/jpeg');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(100);
  });
});
