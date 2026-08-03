/**
 * The one place an order's grand total is computed.
 *
 * Every surface that shows money — the five checkout designs, the cart designs,
 * the confirmation screen, the POS register, order editing — must call this
 * instead of re-adding the parts itself. The rule this enforces is simple and
 * unglamorous: a customer, a cashier, and the merchant's orders list all read
 * the same number off the same arithmetic.
 *
 * Pure: no I/O, no clock, no config lookups. Safe to port to the merchant app
 * and desktop register the way `staff-permissions.ts` and `branding-utils.ts`
 * already are.
 */

/** Money is rounded to centavos at every boundary; floats are not currency. */
const CENTAVO_PRECISION = 100

function roundMoney(value: number): number {
  return Math.round(value * CENTAVO_PRECISION) / CENTAVO_PRECISION
}

/**
 * One deducted line on the bill — a voucher, a manual cashier discount, a
 * free-delivery promo. Kept flat and labelled so the receipt can print it
 * without knowing which subsystem produced it.
 */
export interface OrderDiscountLine {
  /** What the customer sees on the receipt, e.g. "WELCOME10" or "Senior 20%". */
  label: string
  /** Peso amount taken off. Always positive; direction is implied. */
  amount: number
  /** Set when the line came from a voucher rather than a manual discount. */
  voucherId?: string
  code?: string
}

export interface OrderTotalsInput {
  /** Merchandise total: the sum of line subtotals, before fees. */
  subtotal: number
  /** Null when no address has been quoted yet — treated as zero, not unknown. */
  deliveryFee?: number | null
  serviceCharge?: number | null
  discounts?: readonly OrderDiscountLine[]
}

export interface OrderTotals {
  subtotal: number
  deliveryFee: number
  serviceCharge: number
  /**
   * What was actually granted, which is not always what was asked for: a
   * discount larger than the bill is clamped to the bill. Reporting the
   * requested amount instead would overstate every voucher-performance figure.
   */
  discountTotal: number
  grandTotal: number
}

/** Sums the discount lines, ignoring corrupt (negative or non-finite) amounts. */
function sumDiscounts(discounts: readonly OrderDiscountLine[]): number {
  return discounts.reduce((sum, line) => {
    if (!Number.isFinite(line.amount) || line.amount <= 0) return sum
    return sum + line.amount
  }, 0)
}

/**
 * Normalizes the parts and returns the full breakdown. The grand total is
 * floored at zero — a voucher worth more than the cart makes the order free,
 * never a refund.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = roundMoney(input.subtotal ?? 0)
  const deliveryFee = roundMoney(input.deliveryFee ?? 0)
  const serviceCharge = roundMoney(input.serviceCharge ?? 0)

  const chargeable = roundMoney(subtotal + deliveryFee + serviceCharge)
  const requestedDiscount = roundMoney(sumDiscounts(input.discounts ?? []))
  const discountTotal = Math.min(requestedDiscount, chargeable)

  return {
    subtotal,
    deliveryFee,
    serviceCharge,
    discountTotal,
    grandTotal: roundMoney(chargeable - discountTotal),
  }
}
