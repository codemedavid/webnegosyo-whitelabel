/**
 * The tender screen's decisions, kept pure so they are tested — Jest cannot
 * import `app/`.
 *
 * "Pay later" is the second way to finish a counter sale: the order goes to
 * the kitchen now, is written UNPAID with no method, and is settled from the
 * order screen when the customer pays (cash received and change are taken
 * there). It is offered only on a new sale — an edit already settles its own
 * difference against a bill that exists.
 */

import { formatPeso } from "./format";

export type TenderMode = "now" | "later";

export interface RefundGate {
  allowed: boolean;
  reason?: string;
}

export interface TenderBlockInput {
  mode: TenderMode;
  /** Editing a placed order whose new total equals what was already paid. */
  isAlreadySettled: boolean;
  isRefund: boolean;
  refundGate: RefundGate;
  hasMethod: boolean;
  /** A cash method on a sale that takes money in. */
  wantsCashPad: boolean;
  isCashSufficient: boolean;
  isProofOutstanding: boolean;
}

/**
 * Why the swipe is locked, in the order the cashier meets the reasons, or
 * `undefined` when the sale can be completed.
 */
export function tenderBlockedReason(input: TenderBlockInput): string | undefined {
  if (input.isAlreadySettled) return undefined;
  if (input.isRefund && !input.refundGate.allowed) return input.refundGate.reason;
  // Nothing is being paid now, so nothing about the payment can be missing.
  if (input.mode === "later") return undefined;
  if (!input.hasMethod) return "Choose a payment method";
  if (input.wantsCashPad && !input.isCashSufficient) return "Enter the cash received";
  if (!input.isRefund && input.isProofOutstanding) {
    return "Enter the reference number or photograph the confirmation";
  }
  return undefined;
}

export function canOfferPayLater({ isEditing }: { isEditing: boolean }): boolean {
  return !isEditing;
}

/** What an edit is doing to the money; `null` on a new counter sale. */
export type EditIntent = "settled" | "refund" | "collect" | null;

export function tenderSwipeLabel({
  mode,
  edit,
  amountDue,
}: {
  mode: TenderMode;
  edit: EditIntent;
  amountDue: number;
}): string {
  if (edit === "settled") return "Swipe to save the changes";
  if (edit === "refund") return `Swipe to refund  ${formatPeso(amountDue)}`;
  if (edit === "collect") return `Swipe to save and collect  ${formatPeso(amountDue)}`;
  if (mode === "later") return "Swipe to place order · pay later";
  return `Swipe to complete  ${formatPeso(amountDue)}`;
}

export interface CompletedSale {
  total: number;
  /** Cash sales only. */
  changeDue?: number;
  isPayLater: boolean;
  /** Kept on the device because the server could not be reached. */
  isSavedOffline: boolean;
}

export interface CompletedSaleNotice {
  tone: "paid" | "unpaid";
  title: string;
  detail: string;
}

/**
 * The one-line confirmation the register shows after a sale.
 *
 * The change leads when there is any: it is the next thing the cashier hands
 * over, and the tender screen that showed it is already gone.
 */
export function describeCompletedSale(sale: CompletedSale): CompletedSaleNotice {
  const offline = sale.isSavedOffline ? " · saved on this device, syncs when online" : "";

  if (sale.isPayLater) {
    return {
      tone: "unpaid",
      title: `Order placed · ${formatPeso(sale.total)} unpaid`,
      detail: sale.isSavedOffline
        ? "Saved on this device. Collect it from Orders once it syncs."
        : "Collect it from Orders when the customer pays.",
    };
  }

  const change = sale.changeDue ?? 0;
  if (change > 0) {
    return {
      tone: "paid",
      title: `Give ${formatPeso(change)} change`,
      detail: `${formatPeso(sale.total)} sale saved · paid${offline}`,
    };
  }

  return { tone: "paid", title: "Sale saved · paid", detail: `${formatPeso(sale.total)}${offline}` };
}
