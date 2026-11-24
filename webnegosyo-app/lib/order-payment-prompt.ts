/**
 * When moving an order along should first ask about the money, and how the
 * question is worded.
 *
 * Two moments carry a payment decision:
 *
 *   - Confirming an order that is not paid yet (a web order, a QR order). The
 *     merchant chooses: payment received (a GCash transfer they have checked,
 *     or cash handed over right now), or confirm only and collect later.
 *   - Handing over an order that still owes money. Delivering writes `paid`
 *     (see `order-status-change.ts`), so without asking, a "pay later" order
 *     would be marked paid with no cash, no change and no ledger row. A table
 *     is exempt — its bill is settled when the party leaves.
 *
 * Pure: no I/O. Jest cannot import `app/`, so the rules live here.
 */

import { formatPeso } from "./format";
import type { CollectGate } from "./order-collect";
import { isHandoverSettlement } from "./order-paid-state";
import { isCashMethod } from "./pos-payment-methods";

export type PaymentPrompt = "none" | "confirm" | "handover";

export interface PromptOrder {
  status: string;
  customerData?: unknown;
  paymentStatus?: string | null;
}

export function paymentPromptFor(
  order: PromptOrder,
  nextStatus: string,
  { isUnpaid }: { isUnpaid: boolean },
): PaymentPrompt {
  if (!isUnpaid) return "none";
  if (nextStatus === "confirmed") return "confirm";
  if (isHandoverSettlement({ status: nextStatus, customerData: order.customerData })) {
    return "handover";
  }
  return "none";
}

/**
 * What "payment received" does at confirm time.
 *
 * `collect`: cash (or no method at all) — open the collect sheet so the cash
 * received and change are entered and a ledger row is written.
 * `mark-paid`: an online method — the merchant is verifying a transfer that
 * never touched the drawer, recorded the way a web checkout records a paid
 * order (`payment_status = paid`, empty ledger).
 */
export function confirmPaidRoute(methodName: string | null | undefined): "collect" | "mark-paid" {
  if (!methodName?.trim()) return "collect";
  const isCash = isCashMethod({
    id: "order-method",
    name: methodName,
    details: null,
    qr_code_url: null,
    require_payment_proof: false,
    order_index: 0,
  });
  return isCash ? "collect" : "mark-paid";
}

/**
 * What "Already paid" does when an unpaid order is handed over.
 *
 * `mark-paid`: the order carries the method the customer chose (a GCash
 * transfer, cash on pickup), so the reports already file the money under it —
 * marking the order paid is the whole record.
 * `pick-method`: no method on the order (a register "pay later" sale). Marking
 * it paid alone is what filed ₱1,610 of Koko Coffee's November under "Paid,
 * method not picked", so the cashier taps how it was paid and a ledger row is
 * written under that method before the order moves.
 * `refuse`: no method, and this person or order cannot take a payment here —
 * the order stays as it is, with the reason on screen.
 * A store whose backend cannot hold a ledger row at all keeps `mark-paid`:
 * there is no better record to write.
 */
export type HandoverPaidRoute = "mark-paid" | "pick-method" | "refuse";

export function hasOrderMethod(methodName: string | null | undefined): boolean {
  return Boolean(methodName?.trim());
}

export function handoverPaidRoute(
  methodName: string | null | undefined,
  gate: CollectGate,
): HandoverPaidRoute {
  if (hasOrderMethod(methodName)) return "mark-paid";
  if (gate.allowed) return "pick-method";
  if (gate.code === "ledger_absent" || gate.code === "backend") return "mark-paid";
  return "refuse";
}

export interface PromptOption {
  label: string;
  description: string;
}

export interface PaymentPromptCopy {
  title: string;
  question: string;
  /** The option that settles the money. */
  paid: PromptOption;
  /** The option that moves on without taking money now. */
  unpaid: PromptOption;
}

export function paymentPromptCopy(
  kind: Exclude<PaymentPrompt, "none">,
  { amount, methodName }: { amount: number; methodName: string | null | undefined },
): PaymentPromptCopy {
  const money = formatPeso(amount);

  if (kind === "handover") {
    const method = methodName?.trim();
    return {
      title: `${money} is still unpaid`,
      question: "Collect it before the order is handed over?",
      paid: {
        label: `Collect ${money} now`,
        description: "Enter the payment, then mark the order delivered.",
      },
      unpaid: method
        ? {
            label: `Already paid by ${method} — mark delivered`,
            description: `The order is marked paid by ${method}.`,
          }
        : {
            label: "Already paid — choose how",
            description: "Tap how they paid (cash, GCash…). It is recorded under that method, then the order is marked delivered.",
          },
    };
  }

  const isCollect = confirmPaidRoute(methodName) === "collect";
  return {
    title: "Confirm this order",
    question: `Has the customer paid ${money}?`,
    paid: {
      label: "Yes — payment received",
      description: isCollect
        ? "Enter the cash received and the change, then confirm the order."
        : `Confirm the order and mark ${money} paid by ${methodName?.trim()}.`,
    },
    unpaid: {
      label: "Not yet — confirm order only",
      description: `The order stays Unpaid. Collect ${money} at pickup or delivery.`,
    },
  };
}
