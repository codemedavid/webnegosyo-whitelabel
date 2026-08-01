/**
 * The money math behind editing a placed order.
 *
 * An order's payments are an append-only ledger: the original tender, any
 * additional charge taken after an edit raised the total, and any refund issued
 * after an edit lowered it. Nothing is ever updated in place, so the ledger is
 * always a truthful account of what was collected and returned.
 *
 * Pure and side-effect free. Every "collect, refund, or square?" decision in the
 * edit flow routes through {@link settlementIntent}, so there is exactly one
 * place where that judgement lives.
 */

/** Which direction money moved. */
export type PaymentKind = "charge" | "refund";

/** One immutable settlement row. */
export interface OrderPayment {
  kind: PaymentKind;
  /** Always positive; {@link kind} carries the sign. */
  amount: number;
}

/** What the settle screen should ask the cashier to do. */
export type SettlementIntent = "collect" | "refund" | "settled";

/**
 * Balances below this are treated as square. Sub-centavo drift is an artifact
 * of float arithmetic, never something to hand a cashier.
 */
const CENTAVO = 0.01;
const SETTLED_EPSILON = CENTAVO / 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Net collected: charges minus refunds.
 *
 * Non-finite amounts are skipped rather than poisoning the sum with NaN — the
 * ledger is read from an untyped database edge and a single bad row must not
 * make an entire order's money unreadable.
 *
 * May be negative: an over-refund is a real bookkeeping state worth surfacing,
 * not something to clamp away.
 */
export function amountPaid(payments: readonly OrderPayment[]): number {
  const net = payments.reduce((sum, payment) => {
    if (!Number.isFinite(payment.amount)) return sum;
    return payment.kind === "refund" ? sum - payment.amount : sum + payment.amount;
  }, 0);

  return round2(net);
}

/** What the customer still owes. Negative means the merchant owes them back. */
export function computeBalance(total: number, payments: readonly OrderPayment[]): number {
  return round2(total - amountPaid(payments));
}

/** Turn a balance into the action the settle screen should offer. */
export function settlementIntent(balance: number): SettlementIntent {
  if (Math.abs(balance) < SETTLED_EPSILON) return "settled";
  return balance > 0 ? "collect" : "refund";
}
