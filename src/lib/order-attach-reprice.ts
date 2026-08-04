/**
 * Re-pricing a placed order when a voucher is attached to it.
 *
 * This is the arithmetic the three backend write paths — Convex, the platform
 * Postgres, and a tenant's own Postgres — will each persist. It is computed
 * ONCE, here, so those three cannot disagree about what the customer was
 * charged. Each write path's job is to store this result, never to derive its
 * own.
 *
 * The invariant everything rests on, stated in `order-discount.ts` and true on
 * every backend: an order's `total` is ALREADY net of its discount. The stored
 * payload is the breakdown — what to print on the receipt, what to give back on
 * a partial refund — and never the source of the amount charged.
 *
 * So this subtracts only the NEWLY attached lines. Subtracting the carried
 * discount again would take the same money off a second time and hand the
 * customer a bill nobody authorised.
 *
 * That is also why this exists separately from the checkout's
 * `priceOrderWithVouchers`: that prices from scratch against a gross bill, and
 * a placed order is not a fresh one.
 *
 * Pure: no I/O, no clock. Returns new arrays and never mutates its arguments.
 */

import { computeBalance, settlementIntent, type OrderPayment, type SettlementIntent } from './order-balance'
import { newDiscountLines } from './order-discount-attach'
import type { OrderDiscountLine } from './order-totals'

export interface RepriceAttachedDiscountInput {
  /** The order's total AS PLACED — already net of whatever it carried. */
  orderTotal: number
  /** The discount lines the order already carries. Not re-applied. */
  carriedLines: readonly OrderDiscountLine[]
  /** Lines the merchant is attaching now. Carried codes among them are ignored. */
  addedLines: readonly OrderDiscountLine[]
  /** The settlement ledger, for the balance this leaves behind. */
  payments: readonly OrderPayment[]
}

export interface RepricedAttachment {
  /** What the order is now worth. Never below zero. */
  newTotal: number
  /** What the newly attached lines took off, after capping. */
  addedTotal: number
  /** The lines actually applied — the ones to persist and to redeem. */
  newLines: OrderDiscountLine[]
  /** Positive: still owed. Negative: owed back to the customer. */
  balance: number
  intent: SettlementIntent
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Re-price a placed order against the codes being attached to it.
 *
 * The added discount is capped at the order's own total. Two codes that each
 * fit under the bill can still sum past it, and a negative total is money
 * invented — downstream it would read as a refund owed on top of everything
 * already returned.
 */
export function repriceAttachedDiscount(
  input: RepriceAttachedDiscountInput,
): RepricedAttachment {
  const { orderTotal, carriedLines, addedLines, payments } = input

  // Only codes the order does not already carry, and never a manual line:
  // manual money off has no voucher behind it and nothing to redeem.
  const newLines = newDiscountLines(addedLines, carriedLines)

  const chargeable = Math.max(round2(orderTotal), 0)
  const requested = round2(newLines.reduce((sum, line) => sum + line.amount, 0))
  const addedTotal = Math.min(requested, chargeable)

  const newTotal = round2(chargeable - addedTotal)
  const balance = computeBalance(newTotal, payments)

  return {
    newTotal,
    addedTotal,
    newLines,
    balance,
    intent: settlementIntent(balance),
  }
}
