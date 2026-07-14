/**
 * Event registration pricing — volume discount + coupon stacking.
 * Volume discount applies to list price; coupon applies to the remainder.
 */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

export function roundMoney2(n) {
  return Math.round(toNumber(n, 0) * 100) / 100;
}

export function computeDiscountZmw(listZmw, discountType, discountValue) {
  const list = roundMoney2(listZmw);
  const v = roundMoney2(discountValue);
  if (list <= 0) return 0;
  const t = String(discountType || '').toLowerCase().trim();
  if (t === 'fixed' || t === 'amount') {
    return roundMoney2(Math.min(list, Math.max(0, v)));
  }
  const pct = Math.min(100, Math.max(0, v));
  return roundMoney2(list * (pct / 100));
}

export function computeVolumeDiscountZmw(listZmw, eventRow = {}, quantity = 1) {
  const list = roundMoney2(listZmw);
  if (list <= 0) return 0;

  const enabled = parseBoolean(eventRow?.volume_discount_enabled, false);
  if (!enabled) return 0;

  const minQty = Math.max(1, Math.floor(toNumber(eventRow?.volume_discount_min_qty, 5)));
  const qty = Math.max(1, Math.floor(toNumber(quantity, 1)));
  if (qty < minQty) return 0;

  return computeDiscountZmw(
    list,
    eventRow?.volume_discount_type,
    eventRow?.volume_discount_value,
  );
}

/**
 * @param {object} eventRow
 * @param {object} opts
 * @param {number} opts.listZmw
 * @param {number} opts.couponDiscountZmw - discount on post-volume unit price
 * @param {number} opts.quantity
 */
export function resolveEventUnitPricing(eventRow = {}, {
  listZmw = null,
  couponDiscountZmw = 0,
  quantity = 1,
} = {}) {
  const list = roundMoney2(listZmw ?? toNumber(eventRow?.price, 0));
  const volumeDiscount = computeVolumeDiscountZmw(list, eventRow, quantity);
  const afterVolume = roundMoney2(Math.max(0, list - volumeDiscount));
  const couponDiscount = roundMoney2(Math.min(afterVolume, Math.max(0, couponDiscountZmw)));
  const finalZmw = roundMoney2(Math.max(0, afterVolume - couponDiscount));

  return {
    list_zmw: list,
    volume_discount_zmw: volumeDiscount,
    coupon_discount_zmw: couponDiscount,
    discount_zmw: roundMoney2(volumeDiscount + couponDiscount),
    final_zmw: finalZmw,
    volume_discount_applied: volumeDiscount > 0,
  };
}

export function resolveEventOrderPricing(eventRow = {}, {
  listZmw = null,
  couponDiscountZmw = 0,
  quantity = 1,
} = {}) {
  const qty = Math.max(1, Math.floor(toNumber(quantity, 1)));
  const unit = resolveEventUnitPricing(eventRow, { listZmw, couponDiscountZmw, quantity: qty });

  return {
    ...unit,
    ticket_count: qty,
    total_list_zmw: roundMoney2(unit.list_zmw * qty),
    total_volume_discount_zmw: roundMoney2(unit.volume_discount_zmw * qty),
    total_coupon_discount_zmw: roundMoney2(unit.coupon_discount_zmw * qty),
    total_discount_zmw: roundMoney2(unit.discount_zmw * qty),
    total_final_zmw: roundMoney2(unit.final_zmw * qty),
  };
}
