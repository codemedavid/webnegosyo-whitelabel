/**
 * Per-order-type minimum order amount.
 *
 * Pure, dependency-free, deterministic — same constraints as `delivery-fee.ts`,
 * so the client-side checkout gate and the authoritative server-side check in
 * `createOrderAction` apply byte-identical rules.
 *
 * A merchant sets a minimum on each order type ("Delivery ₱500, Pickup none"),
 * because in practice only delivery carries one. `0` — the column default —
 * means "no minimum", so every store that predates this feature keeps checking
 * out unchanged.
 */

import { formatPrice } from './cart-utils'

/** The slice of an order-type row this module needs. */
export interface OrderMinimumSource {
  /** numeric(10,2); may arrive as a string from PostgREST, or be absent pre-migration. */
  minimum_order_amount?: number | string | null
}

/** Whether a cart subtotal clears its order type's minimum. */
export interface OrderMinimumStatus {
  /** Resolved minimum. 0 means no minimum is configured. */
  minimum: number
  /** True when a real (> 0) minimum applies. */
  hasMinimum: boolean
  /** True when the order may proceed. */
  meets: boolean
  /** How much more the customer must add. 0 when `meets` is true. */
  shortfall: number
}

/** Round a currency amount to 2 decimal places, avoiding binary float drift. */
const roundCurrency = (amount: number): number => Math.round(amount * 100) / 100

/**
 * Coerce an untrusted amount to a usable non-negative number.
 * Anything unusable (null, NaN, Infinity, negative, non-numeric text) is 0, which
 * fails open for minimums (no gate) and fails closed for subtotals (gate applies).
 */
const toAmount = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

/**
 * The minimum order amount for an order type, or 0 when none applies.
 * A missing order type, a missing column, and an unusable value all mean "no minimum".
 */
export function resolveOrderMinimum(orderType: OrderMinimumSource | null | undefined): number {
  if (!orderType) return 0
  return toAmount(orderType.minimum_order_amount)
}

/**
 * Check a cart subtotal against its order type's minimum.
 * The comparison is inclusive: a subtotal exactly equal to the minimum passes.
 */
export function checkOrderMinimum(
  subtotal: number,
  orderType: OrderMinimumSource | null | undefined
): OrderMinimumStatus {
  const minimum = resolveOrderMinimum(orderType)
  const amount = toAmount(subtotal)

  if (minimum <= 0) {
    return { minimum: 0, hasMinimum: false, meets: true, shortfall: 0 }
  }

  const meets = amount >= minimum
  return {
    minimum,
    hasMinimum: true,
    meets,
    shortfall: meets ? 0 : roundCurrency(minimum - amount),
  }
}

/**
 * Customer-facing explanation of an unmet minimum, or null when nothing is wrong.
 * Shared by the checkout notice, the blocked-submit toast, and the server rejection
 * so the customer reads the same sentence wherever the order stops.
 */
export function formatOrderMinimumMessage(
  status: OrderMinimumStatus,
  orderTypeName?: string | null
): string | null {
  if (status.meets) return null

  const label = orderTypeName?.trim()
  const scope = label ? `${label} orders have` : 'This order type has'
  return `${scope} a ${formatPrice(status.minimum)} minimum. Add ${formatPrice(status.shortfall)} more to continue.`
}
