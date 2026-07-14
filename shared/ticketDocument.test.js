import { describe, expect, it, vi } from 'vitest';
import {
  resolveAttendeeName,
  formatTicketDate,
} from './ticketViewModel.js';

vi.mock('./ticketPdf.js', () => ({
  generateTicketPdfBlob: vi.fn(),
  buildTicketFilename: vi.fn(),
}));

import { downloadBlob } from './ticketDocument.js';

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 100, getHeight: () => 175 } },
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    rect: vi.fn(),
    roundedRect: vi.fn(),
    text: vi.fn(),
    splitTextToSize: vi.fn((text) => [text]),
    addImage: vi.fn(),
    output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
  })),
}));

vi.mock('./ticketQr.js', () => ({
  buildTicketQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

describe('resolveAttendeeName', () => {
  it('prefers booked_for_name over payer name', () => {
    expect(resolveAttendeeName({ booked_for_name: 'Guest A', user_name: 'Payer' })).toBe('Guest A');
  });

  it('falls back to payer name', () => {
    expect(resolveAttendeeName({ user_name: 'Self' })).toBe('Self');
  });
});

describe('formatTicketDate', () => {
  it('formats ISO dates', () => {
    expect(formatTicketDate('2026-07-15')).toMatch(/2026/);
  });

  it('returns dash for empty values', () => {
    expect(formatTicketDate('')).toBe('—');
  });
});

describe('downloadBlob', () => {
  it('creates a temporary download link', () => {
    const click = vi.fn();
    const revoke = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
    vi.spyOn(document, 'createElement').mockReturnValue({ click, download: '' });

    downloadBlob(new Blob(['x']), 'ticket.pdf');

    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });
});
