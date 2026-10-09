/**
 * Taking money on the bill screen: which share the collect sheet is open for,
 * and what happens when the cashier records it.
 *
 * The writes are the order screen's own (`orders:recordPayment` through the
 * offline-aware mutation, then the paid flag), spread over the bill's orders
 * by `settleBill`. The receipt for the share prints afterwards when the
 * merchant's setting prints a bill-out; a dead printer never fails a payment.
 */
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { CollectedPayment } from "../../components/order/CollectPaymentSheet";
import type { PrintOptions } from "../../hooks/useOrderPrint";
import type { ReceiptOrder } from "../receipt-layout";
import { fromCents, toCents } from "./money";
import { billSummary, type BillOrder } from "./bill-orders";
import { recordPartPayment, type BillPlan } from "./bill-plan";
import type { BillPartView } from "./bill-parts";
import { wholeBillReceipt } from "./bill-receipt";
import { settleBill } from "./settle-bill";

export type CollectTarget = { kind: "bill" } | { kind: "part"; part: BillPartView };

export interface BillCollectInput {
  orders: readonly BillOrder[];
  billTitle: string;
  billKey: string;
  userId?: string;
  outletId?: string;
  recordPayment: (args: Record<string, unknown>) => Promise<unknown>;
  updatePaymentStatus: (args: { orderId: string; paymentStatus: string }) => Promise<unknown>;
  updatePlan: (key: string, change: (plan: BillPlan) => BillPlan) => void;
  /** Prints when the merchant's setting prints a bill-out; never throws. */
  printBillOut: (receipt: ReceiptOrder, options: PrintOptions) => void;
}

export interface BillCollect {
  target: CollectTarget | null;
  /** What the sheet asks for: the share's remainder, or the whole balance. */
  balanceDue: number;
  title: string;
  open: (target: CollectTarget) => void;
  close: () => void;
  submit: (payment: CollectedPayment) => Promise<void>;
}

function paperFor(
  target: CollectTarget,
  orders: readonly BillOrder[],
  recordedCents: number,
  payment: CollectedPayment,
  isWhole: boolean,
): ReceiptOrder {
  const base =
    target.kind === "part"
      ? target.part.receipt(target.part.paidCents + recordedCents)
      : {
          ...wholeBillReceipt(orders, { nowMs: Date.now() }),
          amountPaid: fromCents(toCents(billSummary(orders).paid) + recordedCents),
        };
  return {
    ...base,
    paymentMethod: payment.methodName,
    paymentReference: payment.reference,
    // Cash and change are printed only for a payment that went through whole;
    // a half-recorded one would show change for money not all on the ledger.
    ...(isWhole && payment.cashTendered !== undefined && payment.changeDue !== undefined
      ? { cashTendered: payment.cashTendered, changeDue: payment.changeDue }
      : {}),
  };
}

export function useBillCollect(input: BillCollectInput): BillCollect {
  const [target, setTarget] = useState<CollectTarget | null>(null);
  const owed = billSummary(input.orders).owed;

  const submit = useCallback(
    async (payment: CollectedPayment) => {
      if (!target) return;
      let result;
      try {
        result = await settleBill({
          orders: input.orders,
          payment,
          preferred: target.kind === "part" ? target.part.preferred : undefined,
          billTitle: input.billTitle,
          userId: input.userId,
          outletId: input.outletId,
          recordPayment: input.recordPayment,
          markPaid: (orderId) => input.updatePaymentStatus({ orderId, paymentStatus: "paid" }),
        });
      } catch (err) {
        Alert.alert("Payment not recorded", err instanceof Error ? err.message : "Nothing was recorded. Try again.");
        return;
      }

      if (target.kind === "part") {
        input.updatePlan(input.billKey, (plan) => recordPartPayment(plan, target.part.key, result.recordedCents));
      }
      setTarget(null);

      if (result.recordedCents > 0) {
        const isWhole = result.failure === null;
        input.printBillOut(paperFor(target, input.orders, result.recordedCents, payment, isWhole), {
          printKey: `${input.billKey}:${target.kind === "part" ? target.part.key : "bill"}`,
          withQr: false,
        });
      }

      if (result.failure) {
        Alert.alert(
          "Only part of the payment was recorded",
          `${formatCents(result.recordedCents)} was recorded. The rest was not: ${result.failure.message} ` +
            "The bill now shows what is still owed — collect it again.",
        );
      }
    },
    [target, input],
  );

  return {
    target,
    balanceDue: target?.kind === "part" ? fromCents(target.part.remainingCents) : owed,
    title: target?.kind === "part" ? `Collect · ${target.part.label}` : "Collect the bill",
    open: setTarget,
    close: () => setTarget(null),
    submit,
  };
}

function formatCents(cents: number): string {
  return `₱${fromCents(cents).toFixed(2)}`;
}
