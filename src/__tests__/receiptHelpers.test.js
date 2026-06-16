import { describe, it, expect } from 'vitest';
import {
  resolveReceiptType,
  buildReceiptDetailRows,
  getReceiptLineItemDescription,
  mapBookOrderToReceiptRecord,
  mapRegistrationToReceiptRecord,
  mapCvPaymentToReceiptRecord,
} from '../../shared/receiptHelpers.js';

describe('receiptHelpers', () => {
  it('detects event registrations', () => {
    const reg = mapRegistrationToReceiptRecord({
      event_id: 'evt-1',
      event_title: 'ISO 15189 Workshop',
      registration_type: 'subscription',
    });
    expect(resolveReceiptType(reg)).toBe('event');
    expect(buildReceiptDetailRows(reg)[0]).toEqual(['Event', 'ISO 15189 Workshop']);
    expect(getReceiptLineItemDescription(reg)).toContain('Event Registration');
  });

  it('detects product orders', () => {
    const order = mapBookOrderToReceiptRecord({
      id: 'ord-1',
      payment_reference: 'MM-SHOP-1',
      total: 150,
      items: [{ title: 'Lab Coat', quantity: 1 }],
      payment_status: 'paid',
      created_at: '2026-05-27T10:00:00.000Z',
    });
    expect(resolveReceiptType(order)).toBe('product');
    expect(buildReceiptDetailRows(order)[0]).toEqual(['Product', 'Lab Coat']);
    expect(getReceiptLineItemDescription(order)).toContain('Product Purchase');
  });

  it('detects CV payments', () => {
    const cv = mapCvPaymentToReceiptRecord({
      reference: 'MM-CV-123',
      event_title: 'CV Generator (PDF + Word)',
      amount: 50,
      currency: 'ZMW',
      channel: 'mobile_money',
      created_at: '2026-05-27T10:00:00.000Z',
      customer_name: 'Jane',
      customer_email: 'jane@example.com',
    });
    expect(resolveReceiptType(cv)).toBe('cv');
    expect(buildReceiptDetailRows(cv)[0]).toEqual(['Service', 'CV Generator (PDF + Word)']);
    expect(getReceiptLineItemDescription(cv)).toContain('CV Generator');
  });
});
