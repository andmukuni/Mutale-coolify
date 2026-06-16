import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateReceiptMock = vi.fn().mockResolvedValue(undefined);
const downloadReceiptFromElementMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../utils/receiptPdfClient.js', () => ({
  generateReceipt: (...args) => generateReceiptMock(...args),
  downloadReceiptFromViewModel: (...args) => downloadReceiptFromElementMock(...args),
}));

import { generateReceipt, formatReceiptDisplayNumber, isReceiptEligible } from '../utils/receiptGenerator';

function makeRegistration(overrides = {}) {
  return {
    id: 'reg-1',
    reference_code: 'REG-20240512-ABCD',
    event_title: 'QA Diagnostics Masterclass',
    event_id: 'evt-1',
    event_slug: 'qa-masterclass',
    registered_at: '2024-05-12T09:00:00.000Z',
    registration_type: 'subscription',
    payment_method: 'mobile_money',
    payment_status: 'paid',
    amount_zmw: 250,
    currency: 'ZMW',
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+260977000000',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isReceiptEligible', () => {
  it('returns true for paid, not_required, and waived', () => {
    expect(isReceiptEligible('paid')).toBe(true);
    expect(isReceiptEligible('not_required')).toBe(true);
    expect(isReceiptEligible('waived')).toBe(true);
  });

  it('returns false for pending and unpaid', () => {
    expect(isReceiptEligible('pending')).toBe(false);
    expect(isReceiptEligible('unpaid')).toBe(false);
  });
});

describe('formatReceiptDisplayNumber', () => {
  it('returns a stable 6-digit string for the same reference', () => {
    const reg = makeRegistration({ reference_code: 'MM-EVT-123-ABC' });
    expect(formatReceiptDisplayNumber(reg)).toMatch(/^\d{6}$/);
    expect(formatReceiptDisplayNumber(reg)).toBe(formatReceiptDisplayNumber(reg));
  });
});

describe('generateReceipt', () => {
  it('delegates to receiptPdfClient', async () => {
    await generateReceipt(makeRegistration(), makeUser());
    expect(generateReceiptMock).toHaveBeenCalledTimes(1);
    expect(generateReceiptMock.mock.calls[0][0].reference_code).toBe('REG-20240512-ABCD');
  });
});
