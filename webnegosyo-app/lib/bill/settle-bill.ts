/**
 * Taking one payment for a bill: spread it over the orders it settles and
 * record it on each order's ledger, the way the order screen's Collect does
 * for one order (same mutation, same fields, so the drawer and reports read
 * it like any other collection).
 *
 * Rows are written one at a time and the run stops at the first refusal. The
 * caller re-reads the ledgers either way, so the bill shows what is still owed
 * and the cashier collects the rest; nothing is retried behind their back.
 */
import type { CollectedPayment } from "../../components/order/CollectPaymentSheet";
import { collectLedgerNote } from "../order-collect";
import { shouldMarkOrderPaid } from "../order-paid-state";
import { fromCents, toCents } from "./money";
import { orderOwedCents, type BillOrder } from "./bill-orders";
import { allocateBillPayment } from "./bill-allocate";

export interface SettleBillInput {
  orders: readonly BillOrder[];
  payment: CollectedPayment;
  /** Centavos of this payment that belong to particular orders (a by-item share). */
  preferred?: Readonly<Record<string, number>>;
  billTitle: string;
  userId?: string;
  outletId?: string;
  recordPayment: (args: Record<string, unknown>) => Promise<unknown>;
  markPaid: (orderId: string) => Promise<unknown>;
}

export interface SettleBillResult {
  recordedCents: number;
  failure: { orderId: string; message: string } | null;
}

function pesos(cents: number): string {
  return `₱${fromCents(cents).toFixed(2)}`;
}

export async function settleBill(input: SettleBillInput): Promise<SettleBillResult> {
  const { orders, payment } = input;
  const plan = allocateBillPayment(orders, payment.amount, input.preferred);
  if (plan.unallocated > 0) {
    const owed = orders.reduce((sum, order) => sum + orderOwedCents(order), 0);
    throw new Error(`Only ${pesos(owed)} is still owed on this bill.`);
  }

  const byId = new Map(orders.map((order) => [order._id, order]));
  const billNote = `${input.billTitle} bill`;
  const cashNote = collectLedgerNote(payment);
  let recordedCents = 0;

  for (const [index, allocation] of plan.allocations.entries()) {
    const order = byId.get(allocation.orderId);
    if (!order) continue;
    try {
      await input.recordPayment({
        orderId: allocation.orderId,
        kind: "charge",
        amount: allocation.amount,
        paymentMethodId: payment.methodId,
        paymentMethodName: payment.methodName,
        reference: payment.reference,
        // The cash was handed over once, so it is noted once.
        note: index === 0 && cashNote ? `${cashNote} · ${billNote}` : billNote,
        recordedBy: input.userId,
        outletId: input.outletId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The payment was not recorded.";
      return { recordedCents, failure: { orderId: allocation.orderId, message } };
    }
    recordedCents += toCents(allocation.amount);

    const balanceAfter = fromCents(orderOwedCents(order) - toCents(allocation.amount));
    if (shouldMarkOrderPaid({ paymentStatus: order.paymentStatus, balanceAfter })) {
      // The money is on the ledger; the paid flag only follows it. A refusal
      // here leaves the order reading from its ledger, exactly as Collect does.
      await input.markPaid(order._id).catch((err: unknown) => {
        console.warn("[bill] Payment recorded but the order still reads unpaid:", err);
      });
    }
  }
  return { recordedCents, failure: null };
}
