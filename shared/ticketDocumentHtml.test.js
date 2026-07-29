import { describe, expect, it } from 'vitest';
import { renderTicketDocumentHtml } from './ticketDocumentHtml.js';

const baseViewModel = {
  refCode: 'MM-TKT-TEST',
  ticketNo: 'MM-TKT-TEST',
  attendee: {
    name: 'Jane Guest',
    email: 'jane@example.com',
    phone: '+260971234567',
  },
  payerName: 'John Buyer',
  detailRows: [
    { label: 'Event', value: 'Digital Summit' },
    { label: 'Date', value: 'Tuesday, 15 July 2026' },
    { label: 'Venue', value: 'Lusaka Convention Centre' },
  ],
  logoDataUrl: 'data:image/png;base64,logo',
  qrDataUrl: 'data:image/png;base64,qr',
  ticketUrl: 'https://example.com/tickets/MM-TKT-TEST',
  eventTitle: 'Digital Summit',
  isGuest: true,
};

describe('renderTicketDocumentHtml', () => {
  it('includes entry ticket header and reference', () => {
    const html = renderTicketDocumentHtml(baseViewModel);
    expect(html).toContain('ENTRY TICKET');
    expect(html).toContain('MM-TKT-TEST');
    expect(html).toContain('Jane Guest');
  });

  it('includes gate QR image when provided', () => {
    const html = renderTicketDocumentHtml(baseViewModel);
    expect(html).toContain('data:image/png;base64,qr');
    expect(html).toContain('Present this QR code at the event gate for entry.');
  });

  it('includes event title and venue meta', () => {
    const html = renderTicketDocumentHtml(baseViewModel);
    expect(html).toContain('Digital Summit');
    expect(html).toContain('Lusaka Convention Centre');
    expect(html).toContain('ENTRY TICKET');
    expect(html).toContain('www.mutalemubanga.org');
  });

  it('escapes HTML in attendee name', () => {
    const html = renderTicketDocumentHtml({
      ...baseViewModel,
      attendee: { ...baseViewModel.attendee, name: '<script>alert(1)</script>' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
