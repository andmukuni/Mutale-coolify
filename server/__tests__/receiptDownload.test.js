import { describe, it, expect, vi } from 'vitest';
import {
  resolveReceiptRecordForDownload,
  assertReceiptDownloadAllowedForUser,
} from '../receiptService.js';

function makePool(rowsByQuery = {}) {
  return {
    query: vi.fn(async (sql, params = []) => {
      const key = String(sql);
      if (key.includes('event_registrations')) {
        const id = params[0];
        const row = rowsByQuery.registrations?.[id];
        return [[row || undefined]];
      }
      if (key.includes('book_orders')) {
        const id = params[0];
        const row = rowsByQuery.orders?.[id];
        return [[row || undefined]];
      }
      return [[]];
    }),
  };
}

const mapDbRegistration = (row) => ({ ...row, amount_zmw: Number(row.amount_zmw || 0) });

describe('resolveReceiptRecordForDownload', () => {
  it('returns 400 for invalid source', async () => {
    const result = await resolveReceiptRecordForDownload({
      pool: makePool({}),
      source: 'invalid',
      id: 'x',
      mapDbRegistration,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('loads registration by id', async () => {
    const pool = makePool({
      registrations: {
        'reg-1': {
          id: 'reg-1',
          user_id: 'user-1',
          reference_code: 'MM-EVT-1',
          payment_status: 'paid',
          amount_zmw: 30,
        },
      },
    });
    const result = await resolveReceiptRecordForDownload({
      pool,
      source: 'registration',
      id: 'reg-1',
      mapDbRegistration,
    });
    expect(result.ok).toBe(true);
    expect(result.registration.reference_code).toBe('MM-EVT-1');
    expect(result.ownerUserId).toBe('user-1');
  });

  it('loads order by id and maps to receipt shape', async () => {
    const pool = makePool({
      orders: {
        'ord-1': {
          id: 'ord-1',
          user_id: 'user-2',
          payment_reference: 'MM-ORD-1',
          payment_status: 'paid',
          total: 120,
          items: JSON.stringify([{ title: 'Book One' }]),
        },
      },
    });
    const result = await resolveReceiptRecordForDownload({
      pool,
      source: 'order',
      id: 'ord-1',
      mapDbRegistration,
    });
    expect(result.ok).toBe(true);
    expect(result.registration.line_item_title).toBe('Book One');
    expect(result.ownerUserId).toBe('user-2');
  });

  it('returns 404 when record missing', async () => {
    const result = await resolveReceiptRecordForDownload({
      pool: makePool({}),
      source: 'registration',
      id: 'missing',
      mapDbRegistration,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe('assertReceiptDownloadAllowedForUser', () => {
  it('allows matching user id', () => {
    const result = assertReceiptDownloadAllowedForUser({
      jwtAuth: { claims: { sub: 'user-1' } },
      ownerUserId: 'user-1',
    });
    expect(result.ok).toBe(true);
  });

  it('denies mismatched user id', () => {
    const result = assertReceiptDownloadAllowedForUser({
      jwtAuth: { claims: { sub: 'user-1' } },
      ownerUserId: 'user-2',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
