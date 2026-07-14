import { describe, expect, it, vi } from 'vitest';
import {
  buildTicketScanUrl,
  parseTicketReferenceFromScan,
  buildTicketQrDataUrl,
} from './ticketQr.js';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ticketqr'),
  },
}));

describe('buildTicketScanUrl', () => {
  it('builds gate check-in URL from reference code', () => {
    expect(buildTicketScanUrl('REG-ABC123', 'https://mutalemubanga.org'))
      .toBe('https://mutalemubanga.org/check-in/REG-ABC123');
  });

  it('returns null when reference or origin missing', () => {
    expect(buildTicketScanUrl('', 'https://example.com')).toBeNull();
    expect(buildTicketScanUrl('REG-1', '')).toBeNull();
  });
});

describe('parseTicketReferenceFromScan', () => {
  it('parses full ticket URLs', () => {
    expect(parseTicketReferenceFromScan('https://mutalemubanga.org/tickets/REG-XYZ'))
      .toBe('REG-XYZ');
  });

  it('parses relative ticket paths', () => {
    expect(parseTicketReferenceFromScan('/tickets/REG-ABC'))
      .toBe('REG-ABC');
  });

  it('parses gate check-in URLs', () => {
    expect(parseTicketReferenceFromScan('https://mutalemubanga.org/check-in/REG-XYZ'))
      .toBe('REG-XYZ');
    expect(parseTicketReferenceFromScan('/check-in/REG-ABC'))
      .toBe('REG-ABC');
  });

  it('returns raw code when not a URL', () => {
    expect(parseTicketReferenceFromScan('REG-MANUAL-001'))
      .toBe('REG-MANUAL-001');
  });
});

describe('buildTicketQrDataUrl', () => {
  it('returns PNG data URL for valid ticket', async () => {
    const dataUrl = await buildTicketQrDataUrl('REG-1', 'https://example.com');
    expect(dataUrl).toBe('data:image/png;base64,ticketqr');
  });

  it('returns empty string when URL cannot be built', async () => {
    expect(await buildTicketQrDataUrl('', 'https://example.com')).toBe('');
  });
});
