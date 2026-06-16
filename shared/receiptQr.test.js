import { describe, it, expect, vi } from 'vitest';
import {
  buildEventReceiptQrUrl,
  buildPublicEventPageUrl,
  generateReceiptQrDataUrl,
} from './receiptQr.js';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  },
}));

describe('buildPublicEventPageUrl', () => {
  it('prefers slug over id', () => {
    expect(buildPublicEventPageUrl({
      id: 'evt-1',
      slug: 'my-workshop',
    }, 'https://mutale.dev/')).toBe('https://mutale.dev/events/my-workshop');
  });

  it('uses id when slug is missing', () => {
    expect(buildPublicEventPageUrl({ id: 'evt-99' }, 'https://mutale.dev'))
      .toBe('https://mutale.dev/events/evt-99');
  });
});

describe('buildEventReceiptQrUrl', () => {
  it('returns null for product receipts', () => {
    expect(buildEventReceiptQrUrl({
      receipt_type: 'product',
      items: [{ title: 'Book' }],
    }, 'https://mutale.dev')).toBeNull();
  });

  it('builds URL with slug when present', () => {
    expect(buildEventReceiptQrUrl({
      receipt_type: 'event',
      event_slug: 'qa-workshop',
      event_id: 'evt-1',
    }, 'https://mutale.dev/')).toBe('https://mutale.dev/events/qa-workshop');
  });

  it('falls back to event_id when slug is missing', () => {
    expect(buildEventReceiptQrUrl({
      event_id: 'evt-99',
      event_title: 'Workshop',
    }, 'https://mutale.dev')).toBe('https://mutale.dev/events/evt-99');
  });

  it('returns null without origin or event segment', () => {
    expect(buildEventReceiptQrUrl({ event_slug: 'x' }, '')).toBeNull();
    expect(buildEventReceiptQrUrl({ receipt_type: 'event' }, 'https://mutale.dev')).toBeNull();
  });
});

describe('generateReceiptQrDataUrl', () => {
  it('returns a PNG data URL for a valid URL', async () => {
    const dataUrl = await generateReceiptQrDataUrl('https://mutale.dev/events/test');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('returns empty string for empty URL', async () => {
    expect(await generateReceiptQrDataUrl('')).toBe('');
  });
});
