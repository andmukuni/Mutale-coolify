import { describe, expect, it, vi } from 'vitest';
import {
  EVENT_COVER_MAX_WIDTH,
  EVENT_COVER_MAX_HEIGHT,
  EVENT_COVER_MAX_BYTES,
  compactEventFormImages,
  isHostedImageSrc,
  isInlineImageDataUrl,
  prepareEventCoverSource,
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
  it('uses recommended 16:9 cover dimensions and a small file budget', () => {
    expect(EVENT_COVER_MAX_WIDTH).toBe(1200);
    expect(EVENT_COVER_MAX_HEIGHT).toBe(630);
    expect(EVENT_COVER_MAX_BYTES).toBeLessThanOrEqual(600 * 1024);
  });
});

describe('image source helpers', () => {
  it('detects hosted URLs vs inline data URLs', () => {
    expect(isHostedImageSrc('https://mutalemubanga.org/uploads/events/a.jpg')).toBe(true);
    expect(isHostedImageSrc('/uploads/events/a.jpg')).toBe(true);
    expect(isInlineImageDataUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isHostedImageSrc('data:image/jpeg;base64,abc')).toBe(false);
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

describe('prepareEventCoverSource', () => {
  it('leaves hosted URLs unchanged so clone does not resend a huge payload', async () => {
    const url = 'https://mutalemubanga.org/uploads/events/event-1.jpg';
    expect(await prepareEventCoverSource(url)).toBe(url);
  });
});

describe('compactEventFormImages', () => {
  it('keeps hosted cover and people photos as URLs', async () => {
    const result = await compactEventFormImages({
      cover_image: 'https://mutalemubanga.org/uploads/events/event-1.jpg',
      featured_speakers: [{ name: 'Jane', photo: '/uploads/speakers/a.jpg' }],
      featured_guests: [],
      partners: [{ name: 'WHO', logo: 'https://example.com/logo.png' }],
    });
    expect(result.cover_image).toBe('https://mutalemubanga.org/uploads/events/event-1.jpg');
    expect(result.featured_speakers[0].photo).toBe('/uploads/speakers/a.jpg');
    expect(result.partners[0].logo).toBe('https://example.com/logo.png');
  });
});
