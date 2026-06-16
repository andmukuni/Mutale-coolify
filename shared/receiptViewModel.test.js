import { describe, it, expect, vi } from 'vitest';
import { buildReceiptViewModel } from './receiptViewModel.js';

vi.mock('./receiptQr.js', () => ({
  buildEventReceiptQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

describe('buildReceiptViewModel', () => {
  it('builds event receipt fields with QR when appOrigin set', async () => {
    const vm = await buildReceiptViewModel({
      registration: {
        event_id: 'evt-1',
        event_slug: 'workshop',
        event_title: 'Workshop',
        reference_code: 'MM-1',
        user_name: 'Alice',
        user_email: 'a@b.com',
        amount_zmw: 100,
        currency: 'ZMW',
        payment_method: 'mobile_money',
        registered_at: '2026-05-27T10:00:00.000Z',
        registration_type: 'subscription',
      },
      appOrigin: 'https://mutale.dev',
      logoDataUrl: 'data:image/png;base64,logo',
    });

    expect(vm.refCode).toBe('MM-1');
    expect(vm.receiptNo).toMatch(/^\d{6}$/);
    expect(vm.billedTo.name).toBe('Alice');
    expect(vm.qrDataUrl).toMatch(/^data:image/);
    expect(vm.detailRows.some((r) => r.label === 'Event')).toBe(true);
  });

  it('omits QR for product receipts', async () => {
    const vm = await buildReceiptViewModel({
      registration: {
        receipt_type: 'product',
        items: [{ title: 'Book' }],
        reference_code: 'ORD-1',
        amount_zmw: 50,
      },
      appOrigin: 'https://mutale.dev',
    });

    expect(vm.qrDataUrl).toBe('');
    expect(vm.detailRows.some((r) => r.label === 'Product')).toBe(true);
  });
});
