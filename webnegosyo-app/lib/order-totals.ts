/**
 * The discount-line type, shared with the web codebase.
 *
 * Only the TYPE is ported. `computeOrderTotals` deliberately is not: the
 * register's arithmetic lives in `pos-cart.ts`, because a counter sale has no
 * delivery fee and carries its fees differently from a storefront order. Two
 * implementations of the same function would be exactly the duplication the
 * money-wiring guardrail exists to prevent.
 *
 * This file exists so `lib/vouchers/stacking.ts` can be a VERBATIM copy of
 * `src/lib/vouchers/stacking.ts`, import path and all — see
 * `tests/unit/vouchers/engine-parity.test.ts`, which enforces byte equality.
 * Renaming or moving this file will break that copy.
 */

export interface OrderDiscountLine {
  /** What the customer sees on the receipt, e.g. "WELCOME10" or "Senior 20%". */
  label: string
  /** Peso amount taken off. Always positive; direction is implied. */
  amount: number
  /** Set when the line came from a voucher rather than a manual discount. */
  voucherId?: string
  code?: string
  /** A Senior/PWD (government-mandated) line; its detail is in `government`. */
  isGovernment?: boolean
  /**
   * The dishes a line-specific discount landed on ("Fries ×1") — a
   * unit-limited voucher or a cashier's discount on one item. Absent on
   * order-wide discounts. Keys are the pricing's line ids; stored orders use
   * `line-<index>`.
   */
  items?: readonly DiscountLineItem[]
}

/** One dish a line-specific discount came off. */
export interface DiscountLineItem {
  lineKey: string
  units: number
  amount: number
}
