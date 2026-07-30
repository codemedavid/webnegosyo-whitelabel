/**
 * View models for the payments and edit-history cards on the order detail
 * screen.
 *
 * These cards are the merchant's defence when a customer disputes an edited
 * bill weeks later, so every line has to be unambiguous about which way the
 * money went. They live here rather than in the component because Jest is
 * scoped to `lib/` and `theme/` in this app — "is the refund shown as money
 * leaving?" is not a question to answer by eyeballing a simulator.
 *
 * The settlement summary routes through `order-balance.ts`, the same module the
 * settle screen uses, so the detail card and the settle screen can never
 * disagree about what is still owed.
 *
 * Pure and side-effect free; nothing here reads the clock or mutates its input.
 */

import { computeBalance, settlementIntent, type SettlementIntent } from "./order-balance";
import { formatPeso } from "./format";

/** A settlement row, as either backend returns it. */
export interface OrderPaymentLike {
  _id: string;
  _creationTime: number;
  kind: "charge" | "refund";
  /** Always positive; `kind` carries the direction. */
  amount: number;
  paymentMethodName?: string;
  reference?: string;
  proofUrl?: string;
  note?: string;
}

/** An edit snapshot, as either backend returns it. */
export interface OrderRevisionLike {
  _id: string;
  _creationTime: number;
  revisionNumber: number;
  totalBefore: number;
  totalAfter: number;
  reason?: string;
  revisedBy?: string;
}

export interface PaymentLine {
  _id: string;
  at: number;
  /** Which way the money moved, for the row's colour and icon. */
  direction: "in" | "out";
  /** Signed and formatted: "+₱150.00" or "−₱40.00". */
  amountLabel: string;
  methodLabel: string;
  reference?: string;
  proofUrl?: string;
  note?: string;
}

export interface RevisionLine {
  _id: string;
  at: number;
  revisionNumber: number;
  title: string;
  /** "₱250.00 → ₱370.00" */
  totalsLabel: string;
  direction: "up" | "down" | "level";
  /** Signed and formatted; "₱0.00" when the total did not move. */
  deltaLabel: string;
  reason?: string;
  revisedBy?: string;
}

export interface SettlementSummary {
  totalCharged: number;
  totalRefunded: number;
  amountPaid: number;
  /** Positive: still owed. Negative: owed back to the customer. */
  balance: number;
  intent: SettlementIntent;
  /**
   * The balance, unsigned. The screen labels it ("Still owing" / "Refund due"),
   * so a minus sign here would read as a negative refund.
   */
  balanceLabel: string;
}

/** A minus sign (U+2212), not a hyphen — it aligns with digits. */
const MINUS = "−";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Signed money for a row whose direction is already known. */
function signedPeso(amount: number, isNegative: boolean): string {
  return `${isNegative ? MINUS : "+"}${formatPeso(Math.abs(amount))}`;
}

/**
 * The ledger, in the order it was taken.
 *
 * Deliberately not re-sorted: both backends return payments oldest-first, and
 * that sequence IS the story — an initial tender, a top-up after an edit, a
 * refund after another. Re-ordering it would destroy the narrative the card
 * exists to tell.
 */
export function toPaymentLines(payments: readonly OrderPaymentLike[]): PaymentLine[] {
  return payments.map((payment) => {
    const isRefund = payment.kind === "refund";

    return {
      _id: payment._id,
      at: payment._creationTime,
      direction: isRefund ? "out" : "in",
      amountLabel: signedPeso(payment.amount, isRefund),
      methodLabel: payment.paymentMethodName ?? "Payment",
      reference: payment.reference,
      proofUrl: payment.proofUrl,
      note: payment.note,
    };
  });
}

/**
 * Edit history, newest first.
 *
 * Sorted here rather than trusted from the backend: both order by revision
 * today, but this card must stay correct even if one of them ever changes, and
 * a history read bottom-up tells the wrong story.
 */
export function toRevisionLines(
  revisions: readonly OrderRevisionLike[],
): RevisionLine[] {
  return [...revisions]
    .sort((a, b) => b.revisionNumber - a.revisionNumber)
    .map((revision) => {
      const delta = round2(revision.totalAfter - revision.totalBefore);
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "level";

      return {
        _id: revision._id,
        at: revision._creationTime,
        revisionNumber: revision.revisionNumber,
        title: `Revision ${revision.revisionNumber}`,
        totalsLabel: `${formatPeso(revision.totalBefore)} → ${formatPeso(revision.totalAfter)}`,
        direction,
        deltaLabel: delta === 0 ? formatPeso(0) : signedPeso(delta, delta < 0),
        reason: revision.reason,
        revisedBy: revision.revisedBy,
      };
    });
}

/**
 * Where this order stands: what was charged, what was returned, and what is
 * still owed either way.
 *
 * An order with an empty ledger owes its whole total. Reading that as settled
 * is the single most expensive mistake this screen can make, which is why the
 * judgement is delegated to `settlementIntent` rather than re-derived here.
 */
export function summarizeSettlement(
  total: number,
  payments: readonly OrderPaymentLike[],
): SettlementSummary {
  const totalCharged = round2(
    payments
      .filter((p) => p.kind === "charge")
      .reduce((sum, p) => sum + p.amount, 0),
  );

  const totalRefunded = round2(
    payments
      .filter((p) => p.kind === "refund")
      .reduce((sum, p) => sum + p.amount, 0),
  );

  const balance = computeBalance(total, payments);

  return {
    totalCharged,
    totalRefunded,
    amountPaid: round2(totalCharged - totalRefunded),
    balance,
    intent: settlementIntent(balance),
    balanceLabel: formatPeso(Math.abs(balance)),
  };
}
