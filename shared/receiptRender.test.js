import { describe, it, expect } from 'vitest';
import { renderReceiptMarkup } from './receiptRender.js';
import { RECEIPT_PALETTE } from './receiptTheme.js';

describe('renderReceiptMarkup', () => {
  it('includes receipt sections and brand colours', () => {
    const html = renderReceiptMarkup({
      refCode: 'MM-REF-1',
      receiptNo: '123456',
      billedTo: { name: 'Test User', email: 't@example.com', phone: '' },
      detailRows: [{ label: 'Event', value: 'Workshop' }],
      lineItemDesc: 'Event Registration – Workshop',
      amount: 100,
      currency: 'ZMW',
      lineAmountDisplay: '100.00',
      totalDisplay: '100',
      logoDataUrl: 'data:image/png;base64,x',
      qrDataUrl: 'data:image/png;base64,qr',
    });

    expect(html).toContain('data-receipt-root');
    expect(html).toContain('Reference');
    expect(html).toContain('Billed To');
    expect(html).toContain('TOTAL PAID');
    expect(html).toContain('Thank You!');
    expect(html).toContain(RECEIPT_PALETTE.navy);
    expect(html).toContain('Scan for event');
  });
});
