/**
 * How an order's revenue divides between payment methods.
 *
 * An order carries one `paymentMethod` — the one picked at checkout — but a
 * bill can be settled with several (₱120 by GCash, the rest in cash), and the
 * settlement ledger is what records that. When an order has ledger rows, each
 * method gets what was netted through it; whatever is still unpaid stays with
 * the order's own method, as it always did. An order with no rows reads
 * exactly as before: its whole total under its own method.
 *
 * Pure. Mirrored in `convex-template/convex/paymentSlices.ts` so both backends
 * split a bill the same way.
 */
import { allocateCents, fromCents, toCents } from "../bill/money";

export interface AnalyticsPayment {
  kind: string;
  amount: number;
  /** The method as it was named when the money moved. */
  method?: string;
}

export interface MethodSlice {
  method: string;
  amount: number;
}

export interface SliceableOrder {
  total: number;
  paymentMethod?: string;
  payments?: readonly AnalyticsPayment[];
}

const UNKNOWN_METHOD = "Unknown";

function netByMethod(payments: readonly AnalyticsPayment[], fallback: string): Map<string, number> {
  const nets = new Map<string, number>();
  for (const payment of payments) {
    const method = payment.method?.trim() || fallback;
    const cents = toCents(payment.amount) * (payment.kind === "refund" ? -1 : 1);
    nets.set(method, (nets.get(method) ?? 0) + cents);
  }
  return nets;
}

export function orderMethodSlices(order: SliceableOrder): MethodSlice[] {
  const fallback = order.paymentMethod?.trim() || UNKNOWN_METHOD;
  const totalCents = toCents(order.total);
  const payments = order.payments ?? [];
  if (payments.length === 0 || totalCents <= 0) return [{ method: fallback, amount: order.total }];

  const paid = [...netByMethod(payments, fallback).entries()].filter(([, cents]) => cents > 0);
  const paidCents = paid.reduce((sum, [, cents]) => sum + cents, 0);

  // A ledger that took more than the order now totals (an edit lowered it and
  // no refund was recorded) is scaled down, so revenue never exceeds the sale.
  const shares =
    paidCents > totalCents
      ? allocateCents(totalCents, paid.map(([, cents]) => cents)).map((cents, i) => [paid[i][0], cents] as const)
      : paid;

  const slices = new Map<string, number>(shares);
  const unpaidCents = totalCents - Math.min(paidCents, totalCents);
  if (unpaidCents > 0) slices.set(fallback, (slices.get(fallback) ?? 0) + unpaidCents);

  return [...slices.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([method, cents]) => ({ method, amount: fromCents(cents) }));
}
