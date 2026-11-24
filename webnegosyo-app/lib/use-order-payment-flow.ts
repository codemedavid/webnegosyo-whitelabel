/**
 * The money side of moving an order along, for the order screen.
 *
 * Owns the two sheets and what happens between them:
 *
 *   - "Mark as confirmed/delivered" on an unpaid order asks first
 *     (`order-payment-prompt.ts`). Confirm-only and already-paid go straight
 *     through; "payment received" either marks an online payment paid in one
 *     tap or opens the collect sheet (cash received + change), and the status
 *     moves once the money is recorded.
 *   - "Collect" on its own opens the collect sheet.
 *
 * Every write is injected, so the sequencing — money recorded BEFORE the
 * status that depends on it, a part payment never marking an order delivered
 * — is tested without the screen (Jest cannot import `app/`).
 */

import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { CollectedPayment, CollectPaymentMethod } from "../components/order/CollectPaymentSheet";
import type { PaymentDecisionSummary } from "../components/order/PaymentDecisionSheet";
import { collectLedgerNote, type CollectGate } from "./order-collect";
import { fromCents, toCents } from "./bill/money";
import { settlementIntent } from "./order-balance";
import { shouldMarkOrderPaid } from "./order-paid-state";
import {
  confirmPaidRoute,
  handoverPaidRoute,
  paymentPromptCopy,
  paymentPromptFor,
  type PaymentPrompt,
  type PaymentPromptCopy,
} from "./order-payment-prompt";
import { DEMO_READONLY_MESSAGE } from "./demo";

export interface PaymentFlowOrder {
  _id: string;
  status: string;
  total: number;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  customerData?: Record<string, unknown> | null;
}

export interface OrderPaymentFlowInput {
  order: PaymentFlowOrder | null;
  balanceDue: number;
  isUnpaid: boolean;
  collectGate: CollectGate;
  methods: readonly CollectPaymentMethod[];
  isDemo: boolean;
  userId?: string | null;
  outletId?: string;
  /** The screen's status change. Resolves true once the new status is saved. */
  advance: (status: string) => Promise<boolean>;
  recordPayment: (args: Record<string, unknown>) => Promise<unknown>;
  updatePaymentStatus: (args: { orderId: string; paymentStatus: string }) => Promise<unknown>;
  /** Prints the bill for a settled payment; never throws. */
  printBill: (payment: CollectedPayment) => void;
  /** Injected for tests; defaults to the platform alert. */
  alert?: (title: string, message: string) => void;
}

type PendingStatus = "confirmed" | "delivered";

interface PromptState {
  kind: Exclude<PaymentPrompt, "none">;
  next: PendingStatus;
}

interface CollectState {
  /** The status to move to once the money is recorded, if any. */
  then: PendingStatus | null;
  title?: string;
  submitLabel?: string;
  /** The money was taken already: ask how, not for the cash handed over. */
  isAlreadyPaid?: boolean;
}

export interface OrderPaymentFlow {
  /** Move the order on — asking about the payment first when it matters. */
  requestStatusChange: (next: string) => void;
  /** Open the collect sheet on its own (the "Collect" button). */
  openCollect: () => void;
  decisionSheet: {
    visible: boolean;
    copy: PaymentPromptCopy | null;
    summary: PaymentDecisionSummary;
    paidDisabledReason?: string;
    /** Why "Already paid" cannot be chosen here, shown in place of acting. */
    unpaidDisabledReason?: string;
    isBusy: boolean;
    onPaid: () => void;
    onUnpaid: () => void;
    onClose: () => void;
  };
  collectSheet: {
    visible: boolean;
    balanceDue: number;
    methods: readonly CollectPaymentMethod[];
    preferredMethodName?: string | null;
    initialReference?: string | null;
    title?: string;
    submitLabel?: string;
    isAlreadyPaid?: boolean;
    onSubmit: (payment: CollectedPayment) => Promise<void>;
    /** Split between methods: each payment recorded under its own method. */
    onSubmitSplit: (payments: readonly CollectedPayment[]) => Promise<void>;
    onClose: () => void;
  };
}

function customerReference(order: PaymentFlowOrder | null): string | null {
  const value = order?.customerData?.payment_proof_reference;
  return value == null || String(value).trim() === "" ? null : String(value);
}

function customerProofUrl(order: PaymentFlowOrder | null): string | null {
  const value = order?.customerData?.payment_proof_url;
  return value == null || String(value).trim() === "" ? null : String(value);
}

function formatPesos(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

function joinUnique(values: readonly (string | undefined)[], separator: string): string | undefined {
  const unique = [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
  return unique.length > 0 ? unique.join(separator) : undefined;
}

/**
 * What the bill-out prints for the payments that went through: the total,
 * every method once ("Cash + GCash"), and the cash lines' cash and change —
 * only when the whole split was recorded, so a slip never shows change for
 * money that is not all on the ledger. One payment prints as itself.
 */
export function combinedPayment(payments: readonly CollectedPayment[], isWhole: boolean): CollectedPayment {
  if (payments.length === 1) return payments[0];
  const cash = payments.filter((p) => p.cashTendered !== undefined && p.changeDue !== undefined);
  return {
    amount: fromCents(payments.reduce((sum, p) => sum + toCents(p.amount), 0)),
    methodName: joinUnique(payments.map((p) => p.methodName), " + "),
    reference: joinUnique(payments.map((p) => p.reference), " / "),
    ...(isWhole && cash.length > 0
      ? {
          cashTendered: fromCents(cash.reduce((sum, p) => sum + toCents(p.cashTendered ?? 0), 0)),
          changeDue: fromCents(cash.reduce((sum, p) => sum + toCents(p.changeDue ?? 0), 0)),
        }
      : {}),
  };
}

function platformAlert(title: string, message: string): void {
  Alert.alert(title, message);
}

function isPendingStatus(status: string): status is PendingStatus {
  return status === "confirmed" || status === "delivered";
}

export function useOrderPaymentFlow(input: OrderPaymentFlowInput): OrderPaymentFlow {
  const {
    order,
    balanceDue,
    isUnpaid,
    collectGate,
    methods,
    isDemo,
    userId,
    outletId,
    advance,
    recordPayment,
    updatePaymentStatus,
    printBill,
  } = input;
  const alert = input.alert ?? platformAlert;

  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [collect, setCollect] = useState<CollectState | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const requestStatusChange = useCallback(
    (next: string) => {
      if (!order) return;
      const kind = paymentPromptFor(order, next, { isUnpaid });
      if (kind === "none" || !isPendingStatus(next)) {
        void advance(next);
        return;
      }
      setPrompt({ kind, next });
    },
    [order, isUnpaid, advance],
  );

  const openCollect = useCallback(() => {
    if (isDemo) {
      alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    setCollect({ then: null });
  }, [isDemo, alert]);

  const route =
    prompt?.kind === "confirm" ? confirmPaidRoute(order?.paymentMethod) : "collect";
  const paidDisabledReason =
    route === "collect" && !collectGate.allowed ? collectGate.reason : undefined;
  const alreadyPaidRoute =
    prompt?.kind === "handover" ? handoverPaidRoute(order?.paymentMethod, collectGate) : null;
  const unpaidDisabledReason = alreadyPaidRoute === "refuse" ? collectGate.reason : undefined;

  const onPaid = useCallback(async () => {
    if (!prompt || !order || isBusy) return;
    if (isDemo) {
      alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }

    if (route === "collect") {
      if (!collectGate.allowed) return;
      setPrompt(null);
      setCollect(
        prompt.kind === "confirm"
          ? {
              then: "confirmed",
              title: "Confirm & collect payment",
              submitLabel: "Record payment & confirm",
            }
          : {
              then: "delivered",
              title: "Collect before handing over",
              submitLabel: "Record payment & mark delivered",
            },
      );
      return;
    }

    // An online payment the merchant has checked: recorded the way a web
    // checkout records a paid order. Status first — confirming is what was
    // asked for — then the payment, which must not undo a saved confirm.
    setIsBusy(true);
    try {
      const isConfirmed = await advance(prompt.next);
      if (!isConfirmed) return;
      try {
        await updatePaymentStatus({ orderId: order._id, paymentStatus: "paid" });
      } catch {
        alert(
          "Confirmed, but not marked paid",
          "The order is confirmed. Its payment could not be saved — tap Collect to record it.",
        );
      }
      setPrompt(null);
    } finally {
      setIsBusy(false);
    }
  }, [prompt, order, isBusy, isDemo, alert, route, collectGate.allowed, advance, updatePaymentStatus]);

  const onUnpaid = useCallback(async () => {
    if (!prompt || !order || isBusy) return;

    if (prompt.kind === "handover") {
      if (isDemo) {
        alert("Demo mode", DEMO_READONLY_MESSAGE);
        return;
      }
      if (alreadyPaidRoute === "refuse") return;
      if (alreadyPaidRoute === "pick-method") {
        // No method on the order: marking it paid alone files the money under
        // "Paid, method not picked" forever. Ask how, write the ledger row.
        setPrompt(null);
        setCollect({
          then: "delivered",
          title: "How was it paid?",
          submitLabel: "Record & mark delivered",
          isAlreadyPaid: true,
        });
        return;
      }
      // The order carries its method: delivered + paid is the whole record.
      setIsBusy(true);
      try {
        const isMoved = await advance(prompt.next);
        if (!isMoved) return;
        try {
          await updatePaymentStatus({ orderId: order._id, paymentStatus: "paid" });
        } catch (err) {
          console.warn("[order] Delivered, but the order still reads unpaid:", err);
        }
        setPrompt(null);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    // Confirm only: the order stays unpaid, to be collected at handover.
    setIsBusy(true);
    try {
      const isMoved = await advance(prompt.next);
      if (isMoved) setPrompt(null);
    } finally {
      setIsBusy(false);
    }
  }, [prompt, order, isBusy, isDemo, alert, alreadyPaidRoute, advance, updatePaymentStatus]);

  /**
   * One payment, or a split tender (₱200 cash, the rest by GCash) as several:
   * each is its own ledger row under its own method, written in turn, so the
   * reports and the drawer count the cash as cash and the GCash as GCash.
   * The run stops at the first refusal; whatever WAS recorded stays recorded
   * and the screen re-reads the ledger, so the cashier collects the rest.
   */
  const settle = useCallback(
    async (payments: readonly CollectedPayment[]) => {
      if (!order || !collect || payments.length === 0) return;

      const recorded: CollectedPayment[] = [];
      let failure: string | null = null;
      for (const payment of payments) {
        try {
          await recordPayment({
            orderId: order._id,
            kind: "charge",
            amount: payment.amount,
            paymentMethodId: payment.methodId,
            paymentMethodName: payment.methodName,
            reference: payment.reference,
            // The cash handed over and the change, kept on the row: the ledger
            // has no columns for them, and a drawer that does not reconcile is
            // traced back through exactly these figures.
            note: collectLedgerNote(payment),
            recordedBy: userId ?? undefined,
            outletId,
          });
          recorded.push(payment);
        } catch (err) {
          failure = err instanceof Error ? err.message : "Nothing was recorded. Try again.";
          break;
        }
      }

      if (recorded.length === 0) {
        alert("Could not record the payment", failure ?? "Nothing was recorded. Try again.");
        return;
      }

      const then = collect.then;
      setCollect(null);
      const recordedCents = recorded.reduce((sum, payment) => sum + toCents(payment.amount), 0);
      const balanceAfter = fromCents(toCents(balanceDue) - recordedCents);

      // The ledger now holds the money; the order row must say so too — but
      // only when the payment squares the bill. A part payment leaves the order
      // genuinely owing, and "paid" on it would hide the rest. Never an alert:
      // the money IS recorded, and the chip falls back to the ledger.
      if (shouldMarkOrderPaid({ paymentStatus: order.paymentStatus, balanceAfter })) {
        try {
          await updatePaymentStatus({ orderId: order._id, paymentStatus: "paid" });
        } catch (err) {
          console.warn("[order] Payment recorded but the order still reads unpaid:", err);
        }
      }

      // Bill-out: the money is settled, so this is the customer's receipt.
      printBill(combinedPayment(recorded, failure === null));

      if (failure !== null) {
        alert(
          "Only part of the payment was recorded",
          `${formatPesos(fromCents(recordedCents))} was recorded. The rest was not: ${failure} ` +
            "The order now shows what is still owed — collect it again.",
        );
        return;
      }

      if (!then) return;
      // Handing over an order that still owes money would mark it paid
      // (delivery settles an order), hiding the part still owed.
      if (then === "delivered" && settlementIntent(balanceAfter) === "collect") {
        alert(
          "Part payment recorded",
          "The order was not marked delivered because money is still owed on it. Collect the rest, then mark it delivered.",
        );
        return;
      }
      await advance(then);
    },
    [order, collect, recordPayment, userId, outletId, alert, balanceDue, updatePaymentStatus, printBill, advance],
  );
  const onSubmitCollect = useCallback((payment: CollectedPayment) => settle([payment]), [settle]);

  const copy = prompt
    ? paymentPromptCopy(prompt.kind, { amount: balanceDue, methodName: order?.paymentMethod })
    : null;

  return {
    requestStatusChange,
    openCollect,
    decisionSheet: {
      visible: prompt !== null,
      copy,
      summary: {
        amount: balanceDue,
        methodName: order?.paymentMethod,
        reference: customerReference(order),
        proofUrl: customerProofUrl(order),
      },
      paidDisabledReason,
      unpaidDisabledReason,
      isBusy,
      onPaid: () => void onPaid(),
      onUnpaid: () => void onUnpaid(),
      onClose: () => {
        if (!isBusy) setPrompt(null);
      },
    },
    collectSheet: {
      visible: collect !== null,
      balanceDue,
      methods,
      preferredMethodName: order?.paymentMethod,
      initialReference: customerReference(order),
      title: collect?.title,
      submitLabel: collect?.submitLabel,
      isAlreadyPaid: collect?.isAlreadyPaid,
      onSubmit: onSubmitCollect,
      onSubmitSplit: settle,
      onClose: () => setCollect(null),
    },
  };
}
