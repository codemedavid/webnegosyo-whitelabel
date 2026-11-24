/**
 * A new counter sale paid with more than one method at the register:
 * ₱200 in cash and the rest by GCash.
 *
 * The lines and their rules are the collect sheet's (`lib/bill/split-tender.ts`,
 * `SplitTenderEditor`); this adds what the register asks on top:
 * - the lines must cover the WHOLE sale (a register sale is never left part-paid;
 *   "Pay later" is how a sale goes out unpaid);
 * - a non-cash method the store wants evidence for needs its reference number
 *   (the single-method screen takes a reference OR a photo; a split line only
 *   has room for the reference).
 *
 * How the sale is written (pos-tender.tsx): the order is inserted paid with NO
 * single method on it, and each line becomes its own `orders:recordPayment`
 * row, so the drawer, the shift's expected cash and the reports count every
 * method exactly (ledger rows override the order's method everywhere). Until
 * the rows land, a method-less sale reads as non-cash: the drawer is never
 * told to expect cash it may not hold.
 *
 * Pure.
 */
import { fromCents, toCents } from "./bill/money";
import { validateSplitTender, type SplitPayment, type TenderLine } from "./bill/split-tender";
import { formatPeso } from "./format";
import { collectLedgerNote, type CollectMethodOption } from "./order-collect";
import type { PosTender } from "./pos-order";
import { isCashMethod, requiresProof, type PosPaymentMethod } from "./pos-payment-methods";

export type PosSplitVerdict =
  | { ok: true; payments: SplitPayment[] }
  | { ok: false; error: string };

/** The register's methods in the shape the split editor draws. */
export function splitMethodOptions(methods: readonly PosPaymentMethod[]): CollectMethodOption[] {
  return methods.map((method) => ({ id: method.id, name: method.name, isCash: isCashMethod(method) }));
}

/** Split is offered on a new sale paid now, when there is a second method to split with. */
export function canSplitAtRegister({ methodCount, isEditing }: { methodCount: number; isEditing: boolean }): boolean {
  return !isEditing && methodCount >= 2;
}

/** A non-cash line whose method the store wants evidence for needs its reference. */
export function isSplitReferenceRequired(methods: readonly PosPaymentMethod[], methodId: string): boolean {
  const method = methods.find((candidate) => candidate.id === methodId);
  return method !== undefined && !isCashMethod(method) && requiresProof(method);
}

export function validatePosSplit(
  lines: readonly TenderLine[],
  methods: readonly PosPaymentMethod[],
  amountDue: number,
): PosSplitVerdict {
  const verdict = validateSplitTender(lines, splitMethodOptions(methods), amountDue);
  if (!verdict.ok) return verdict;

  const coveredCents = verdict.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const leftCents = toCents(amountDue) - coveredCents;
  if (leftCents > 0) {
    return {
      ok: false,
      error: `${formatPeso(fromCents(leftCents))} is still owed. Add it to a line, or leave the last amount blank for the rest.`,
    };
  }

  for (const payment of verdict.payments) {
    if (isSplitReferenceRequired(methods, payment.methodId) && !payment.reference) {
      return { ok: false, error: `Enter the ${payment.methodName} reference number.` };
    }
  }
  return verdict;
}

function joinUnique(values: readonly (string | undefined)[], separator: string): string | undefined {
  const kept = [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
  return kept.length > 0 ? kept.join(separator) : undefined;
}

/**
 * One tender for the paper and the "change" line: "G-Cash + Cash", the cash
 * handed over and the change for the cash part(s). Never written to the order
 * itself — the order carries the lines, the ledger the money.
 */
export function splitReceiptTender(payments: readonly SplitPayment[]): PosTender {
  const cash = payments.filter((payment) => payment.cashTendered !== undefined);
  const sum = (values: number[]) => fromCents(values.reduce((total, value) => total + toCents(value), 0));
  return {
    methodName: joinUnique(payments.map((payment) => payment.methodName), " + ") ?? "",
    isCash: cash.length > 0,
    ...(cash.length > 0
      ? {
          cashTendered: sum(cash.map((payment) => payment.cashTendered ?? 0)),
          changeDue: sum(cash.map((payment) => payment.changeDue ?? 0)),
        }
      : {}),
    ...(joinUnique(payments.map((payment) => payment.reference), " / ")
      ? { reference: joinUnique(payments.map((payment) => payment.reference), " / ") }
      : {}),
  };
}

/** What `customerData.pos.split` records: who paid what, for the order screen and support. */
export interface PosSplitRecord {
  methodName: string;
  methodId: string;
  amount: number;
  reference?: string;
  cashTendered?: number;
  changeDue?: number;
}

export function splitRecord(payments: readonly SplitPayment[]): PosSplitRecord[] {
  return payments.map((payment) => ({ ...payment }));
}

export interface SplitLedgerContext {
  orderId: string;
  recordedBy?: string;
  outletId?: string;
}

/**
 * The `orders:recordPayment` arguments, one per line, in the order typed.
 * The ledger amount is what the sale took; the cash handed over and the
 * change ride on the cash row's note, as on the collect sheet.
 */
export function splitLedgerRows(
  payments: readonly SplitPayment[],
  context: SplitLedgerContext,
): Record<string, unknown>[] {
  return payments.map((payment) => {
    const note = collectLedgerNote(payment);
    return {
      orderId: context.orderId,
      kind: "charge",
      amount: payment.amount,
      paymentMethodId: payment.methodId,
      paymentMethodName: payment.methodName,
      ...(payment.reference ? { reference: payment.reference } : {}),
      ...(context.recordedBy ? { recordedBy: context.recordedBy } : {}),
      ...(context.outletId ? { outletId: context.outletId } : {}),
      ...(note ? { note } : {}),
    };
  });
}
