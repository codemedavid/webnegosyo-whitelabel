/**
 * Whether an order still owes money — read from BOTH of the places that know.
 *
 * Two independent records answer "has this been paid?", and neither is
 * complete on its own:
 *
 *   - `paymentStatus` on the order row. Written at checkout and by the
 *     register's tender. An order paid online carries `paid` with an empty
 *     ledger, because that money never passed through a settlement row.
 *   - The settlement ledger, cached on the row as `amountPaid`. Written when a
 *     cashier collects on a bill that was rung up earlier — and, until now,
 *     the only thing that write touched.
 *
 * Reading only the status is what made every collected order keep its red
 * "Unpaid" chip; reading only the ledger would ask a cashier to collect a bill
 * the customer already settled online. So a row is settled when EITHER says so,
 * and the epsilon that decides "square" is {@link settlementIntent}'s, shared
 * with the collect gate and the settlement card.
 */

import { settlementIntent } from "./order-balance";

/** Statuses that mean money is in hand. `verified` is an approved proof. */
const SETTLED_STATUSES: readonly string[] = ["paid", "verified"];

export interface OrderPaidStateLike {
  /** The order row's own column. Absent means the backend said nothing. */
  paymentStatus?: string | null;
  total?: number | null;
  /** Net of the settlement ledger. Absent on deployments without one. */
  amountPaid?: number | null;
}

function isSettledStatus(paymentStatus?: string | null): boolean {
  return paymentStatus != null && SETTLED_STATUSES.includes(paymentStatus);
}

/**
 * Is there money still owed on this order?
 *
 * False for an order that carries no status at all: that is a backend with
 * nothing to say about payment, and a card must not invent a debt from silence
 * — the same reading the "Unpaid" chip has always had.
 */
export function isOrderUnpaid(order: OrderPaidStateLike): boolean {
  if (order.paymentStatus == null) return false;
  if (isSettledStatus(order.paymentStatus)) return false;

  // A non-numeric or absent cache is a backend that keeps no ledger, NOT a
  // zero: falling through to the status is the only honest answer there.
  const collected = order.amountPaid;
  if (typeof collected !== "number" || !Number.isFinite(collected)) return true;

  const total = typeof order.total === "number" && Number.isFinite(order.total)
    ? order.total
    : 0;

  return settlementIntent(total - collected) === "collect";
}

export interface MarkPaidRequest {
  paymentStatus?: string | null;
  /** What is left owing once the payment being recorded is counted. */
  balanceAfter: number;
}

/**
 * Should recording this payment also flip the order's status to paid?
 *
 * Only when the bill is actually square — a part payment leaves the order
 * owing, and saying "paid" on it would hide the rest of the debt. An order
 * already reading as settled is left alone rather than re-written.
 */
export function shouldMarkOrderPaid({
  paymentStatus,
  balanceAfter,
}: MarkPaidRequest): boolean {
  if (isSettledStatus(paymentStatus)) return false;
  return settlementIntent(balanceAfter) !== "collect";
}
