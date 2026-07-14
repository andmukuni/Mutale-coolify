import { describe, it, expect } from 'vitest';
import {
  computeVolumeDiscountZmw,
  resolveEventUnitPricing,
  resolveEventOrderPricing,
} from './eventPricing.js';

describe('eventPricing', () => {
  const event = {
    price: 100,
    volume_discount_enabled: true,
    volume_discount_min_qty: 5,
    volume_discount_type: 'percent',
    volume_discount_value: 10,
  };

  it('applies volume discount when quantity meets threshold', () => {
    expect(computeVolumeDiscountZmw(100, event, 5)).toBe(10);
    expect(computeVolumeDiscountZmw(100, event, 4)).toBe(0);
  });

  it('stacks coupon on remainder after volume discount', () => {
    const unit = resolveEventUnitPricing(event, {
      listZmw: 100,
      couponDiscountZmw: 9,
      quantity: 5,
    });
    expect(unit.volume_discount_zmw).toBe(10);
    expect(unit.coupon_discount_zmw).toBe(9);
    expect(unit.final_zmw).toBe(81);
  });

  it('computes order totals', () => {
    const order = resolveEventOrderPricing(event, {
      listZmw: 100,
      couponDiscountZmw: 0,
      quantity: 6,
    });
    expect(order.total_final_zmw).toBe(540);
    expect(order.total_volume_discount_zmw).toBe(60);
  });
});
