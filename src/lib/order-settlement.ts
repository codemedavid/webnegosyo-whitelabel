/**
 * The settlement account behind a placed order's balance.
 *
 * `computeBalance` answers one number. A merchant looking at an order needs the
 * account behind it: what was charged, what was given back, what that nets to,
 * and which of collect / refund / settled to offer.
 *
 * This is the layer the "attach a voucher to a placed order" flow reads. After
 * a ₱40 code lands on a fully paid ₱250 order the merchant must be shown a
 * refund of ₱40 — which needs the charged and refunded halves kept apart rather
 * than collapsed into a net figure.
 *
 * PORT of `summarizeSettlement` in `webnegosyo-app/lib/order-history-view.ts`,
 * pinned by `tests/unit/order-settlement-parity.test.ts`.
 *
 * Numbers only, deliberately. The app's version also returns a pre-formatted
 * `balanceLabel` built from its own `formatPeso`; the web formats with
 * `formatPrice` from `@/lib/cart-utils`, so porting the label would be a second
 * money-formatting implementation with no caller. Callers label it themselves —
 * and must, because `balance` is signed while the label is not: the screen says
 * "Still owing" or "Refund due", so a minus sign in the figure would read as a
 * negative refund.
 */

import { computeBalance, settlementIntent, type OrderPayment, type SettlementIntent } from './order-balance'

export interface SettlementSummary {
  /** Everything taken, ignoring anything given back. */
  totalCharged: number
  /** Everything given back. */
  totalRefunded: number
  /** Net collected: charged minus refunded. May be negative on an over-refund. */
  amountPaid: number
  /** Positive: still owed. Negative: owed back to the customer. */
  balance: number
  intent: SettlementIntent
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function sumOf(payments: readonly OrderPayment[], kind: OrderPayment['kind']): number {
  return round2(
    payments.filter((payment) => payment.kind === kind).reduce((sum, payment) => sum + payment.amount, 0),
  )
}

/**
 * An order with an empty ledger owes its whole total. Reading that as settled
 * is the single most expensive mistake this layer can make, which is why the
 * judgement is delegated to `settlementIntent` rather than re-derived here.
 */
export function summarizeSettlement(
  total: number,
  payments: readonly OrderPayment[],
): SettlementSummary {
  const totalCharged = sumOf(payments, 'charge')
  const totalRefunded = sumOf(payments, 'refund')
  const balance = computeBalance(total, payments)

  return {
    totalCharged,
    totalRefunded,
    amountPaid: round2(totalCharged - totalRefunded),
    balance,
    intent: settlementIntent(balance),
  }
}
