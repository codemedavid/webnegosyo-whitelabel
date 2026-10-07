/**
 * Free delivery above a minimum order ("Free delivery on orders ₱500+").
 *
 * Pure, so the checkout summary and the order action agree to the centavo:
 * the browser shows the waived fee, and `createOrderAction` re-applies the
 * same rule to the fee it recomputed itself — the browser's number is never
 * what gets billed.
 *
 * Measured against the PRE-DISCOUNT item subtotal, the same figure the
 * per-order-type minimum uses: the fee is an input to voucher pricing, so a
 * post-discount subtotal would make the two depend on each other. The waiver
 * applies to whichever fee source the store uses (Lalamove or distance); with
 * Lalamove the store still books the courier and absorbs the cost.
 */

/** `tenants.free_delivery_min_order` as stored; NULL means the offer is off. */
export function resolveFreeDeliveryThreshold(raw: unknown): number | null {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

const qualifies = (itemsSubtotal: number, threshold: number | null): boolean =>
  threshold !== null && itemsSubtotal >= threshold

/**
 * The fee to bill. A missing fee (no fee source, or no quote yet) stays
 * missing — a 0 would read as "quoted and free" before any quote exists.
 */
export function waiveDeliveryFee<T extends number | null | undefined>(
  fee: T,
  itemsSubtotal: number,
  threshold: number | null
): T | 0 {
  if (fee === null || fee === undefined) return fee
  return qualifies(itemsSubtotal, threshold) ? 0 : fee
}

/** How much more the cart needs for free delivery: 0 once met, null when off. */
export function amountToFreeDelivery(itemsSubtotal: number, threshold: number | null): number | null {
  if (threshold === null) return null
  if (qualifies(itemsSubtotal, threshold)) return 0
  return Math.round((threshold - itemsSubtotal) * 100) / 100
}
