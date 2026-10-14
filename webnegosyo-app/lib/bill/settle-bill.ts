/**
 * Taking one payment for a bill: spread it over the orders it settles and
 * record it on each order's ledger, the way the order screen's Collect does
 * for one order (same mutation, same fields, so the drawer and reports read
 * it like any other collection).
 *
 * Rows are written one at a time and the run stops at the first refusal. The
 * caller re-reads the ledgers either way, so the bill shows what is still owed
 * and the cashier collects the rest; nothing is retried behind their back.
 *
 * A split tender (₱120 GCash, the rest in cash) is several payments settled in
 * turn by `settleBillTenders`: each keeps its own method on its own rows, which
 * is what lets the reports count the GCash as GCash and the cash as cash.
 */
import type { CollectedPayment } from "../../components/order/CollectPaymentSheet";
import { collectLedgerNote } from "../order-collect";
import { shouldMarkOrderPaid } from "../order-paid-state";
import { fromCents, toCents } from "./money";
import { orderOwedCents, type BillOrder } from "./bill-orders";
import { allocateBillPayment, type PaymentAllocation } from "./bill-allocate";

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

export interface SettleFailure {
  orderId: string;
  message: string;
}

export interface SettleBillResult {
  recordedCents: number;
  /** The rows that were written, in order. */
  allocations: PaymentAllocation[];
  failure: SettleFailure | null;
}

function pesos(cents: number): string {
  return `₱${fromCents(cents).toFixed(2)}`;
}

function owedRefusal(orders: readonly BillOrder[]): Error {
  const owed = orders.reduce((sum, order) => sum + orderOwedCents(order), 0);
  return new Error(`Only ${pesos(owed)} is still owed on this bill.`);
}

export async function settleBill(input: SettleBillInput): Promise<SettleBillResult> {
  const { orders, payment } = input;
  const plan = allocateBillPayment(orders, payment.amount, input.preferred);
  if (plan.unallocated > 0) throw owedRefusal(orders);

  const byId = new Map(orders.map((order) => [order._id, order]));
  const billNote = `${input.billTitle} bill`;
  const cashNote = collectLedgerNote(payment);
  let recordedCents = 0;
  const written: PaymentAllocation[] = [];

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
      return { recordedCents, allocations: written, failure: { orderId: allocation.orderId, message } };
    }
    recordedCents += toCents(allocation.amount);
    written.push(allocation);

    const balanceAfter = fromCents(orderOwedCents(order) - toCents(allocation.amount));
    if (shouldMarkOrderPaid({ paymentStatus: order.paymentStatus, balanceAfter })) {
      // The money is on the ledger; the paid flag only follows it. A refusal
      // here leaves the order reading from its ledger, exactly as Collect does.
      await input.markPaid(order._id).catch((err: unknown) => {
        console.warn("[bill] Payment recorded but the order still reads unpaid:", err);
      });
    }
  }
  return { recordedCents, allocations: written, failure: null };
}

export interface SettleTendersInput extends Omit<SettleBillInput, "payment"> {
  /** In the order they are taken; each is recorded under its own method. */
  payments: readonly CollectedPayment[];
}

export interface SettleTendersResult {
  recordedCents: number;
  /** The payments that reached the ledger, at the amount that did. */
  recorded: CollectedPayment[];
  failure: SettleFailure | null;
}

/** Cash and change describe the whole tender, so a partly recorded one drops them. */
function partlyRecorded(payment: CollectedPayment, recordedCents: number): CollectedPayment {
  return {
    amount: fromCents(recordedCents),
    ...(payment.methodId !== undefined ? { methodId: payment.methodId } : {}),
    ...(payment.methodName !== undefined ? { methodName: payment.methodName } : {}),
    ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
  };
}

/** The bill as the next payment sees it: what was just written is now paid. */
function withAllocations(orders: readonly BillOrder[], allocations: readonly PaymentAllocation[]): BillOrder[] {
  return orders.map((order) => {
    const cents = allocations
      .filter((a) => a.orderId === order._id)
      .reduce((sum, a) => sum + toCents(a.amount), 0);
    return cents > 0 ? { ...order, amountPaid: fromCents(toCents(order.amountPaid) + cents) } : order;
  });
}

/** A by-item share's per-order centavos, less what the last payment placed. */
function remainingPreferred(
  preferred: Readonly<Record<string, number>> | undefined,
  allocations: readonly PaymentAllocation[],
): Record<string, number> | undefined {
  if (!preferred) return undefined;
  return Object.fromEntries(
    Object.entries(preferred).map(([orderId, cents]) => {
      const placed = allocations
        .filter((a) => a.orderId === orderId)
        .reduce((sum, a) => sum + toCents(a.amount), 0);
      return [orderId, Math.max(0, cents - placed)];
    }),
  );
}

/**
 * Several payments against one bill, taken in turn. The whole set is checked
 * against what is owed before anything is written, so a split that adds up to
 * too much records nothing. Stops at the first refused row, like `settleBill`.
 */
export async function settleBillTenders(input: SettleTendersInput): Promise<SettleTendersResult> {
  const { payments, ...rest } = input;
  const totalCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const owedCents = input.orders.reduce((sum, order) => sum + orderOwedCents(order), 0);
  if (totalCents > owedCents) throw owedRefusal(input.orders);

  let orders: readonly BillOrder[] = input.orders;
  let preferred = input.preferred;
  let recordedCents = 0;
  const recorded: CollectedPayment[] = [];

  for (const payment of payments) {
    const result = await settleBill({ ...rest, orders, preferred, payment });
    recordedCents += result.recordedCents;
    if (result.recordedCents > 0) {
      recorded.push(result.failure ? partlyRecorded(payment, result.recordedCents) : payment);
    }
    if (result.failure) return { recordedCents, recorded, failure: result.failure };
    orders = withAllocations(orders, result.allocations);
    preferred = remainingPreferred(preferred, result.allocations);
  }
  return { recordedCents, recorded, failure: null };
}
