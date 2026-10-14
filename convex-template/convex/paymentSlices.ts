/**
 * How an order's revenue divides between payment methods.
 *
 * An order carries one `paymentMethod` — the one picked at checkout — but a
 * bill can be settled with several (₱120 by GCash, the rest in cash), and the
 * `orderPayments` ledger is what records that. With ledger rows, each method
 * gets what was netted through it and anything still unpaid stays with the
 * order's own method; with none, the whole total counts under that method, as
 * before.
 *
 * Mirror of `webnegosyo-app/lib/backends/analytics-payment-slices.ts`, which
 * serves platform-backend stores. Keep the two identical.
 */

export interface SlicePayment {
  kind: string;
  amount: number;
  paymentMethodName?: string;
}

export interface MethodSlice {
  method: string;
  amount: number;
}

const UNKNOWN = "Unknown";

function toCents(pesos: number): number {
  return Math.round(pesos * 100 + Number.EPSILON * Math.sign(pesos));
}

/** Largest-remainder shares of `total`, ties to the earlier share. */
function allocateCents(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const shares = exact.map(Math.floor);
  let spare = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - shares[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (spare <= 0) break;
    shares[index] += 1;
    spare -= 1;
  }
  return shares;
}

export function orderMethodSlices(
  order: { total: number; paymentMethod?: string },
  payments: readonly SlicePayment[] = []
): MethodSlice[] {
  const fallback = order.paymentMethod?.trim() || UNKNOWN;
  const totalCents = toCents(order.total);
  if (payments.length === 0 || totalCents <= 0) return [{ method: fallback, amount: order.total }];

  const nets = new Map<string, number>();
  for (const payment of payments) {
    const method = payment.paymentMethodName?.trim() || fallback;
    const cents = toCents(payment.amount) * (payment.kind === "refund" ? -1 : 1);
    nets.set(method, (nets.get(method) ?? 0) + cents);
  }
  const paid = [...nets.entries()].filter(([, cents]) => cents > 0);
  const paidCents = paid.reduce((sum, [, cents]) => sum + cents, 0);
  const shares =
    paidCents > totalCents
      ? allocateCents(totalCents, paid.map(([, cents]) => cents)).map((cents, i) => [paid[i][0], cents] as const)
      : paid;

  const slices = new Map<string, number>(shares);
  const unpaidCents = totalCents - Math.min(paidCents, totalCents);
  if (unpaidCents > 0) slices.set(fallback, (slices.get(fallback) ?? 0) + unpaidCents);

  return [...slices.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([method, cents]) => ({ method, amount: cents / 100 }));
}
