/**
 * Spreading one payment over the orders of a bill.
 *
 * The ledger is per order, so a payment for a combined bill is recorded as one
 * row per order it settles. A guest's by-item share already knows which orders
 * it belongs to, and fills those first; anything else goes to the oldest order
 * still owing. Nothing is ever placed beyond what an order owes: over-collecting
 * makes the shop owe a refund the cashier may not be allowed to give.
 */
import { fromCents, toCents } from "./money";
import { orderOwedCents, sortBillOrders, type BillOrder } from "./bill-orders";

export interface PaymentAllocation {
  orderId: string;
  amount: number;
}

export interface BillPaymentPlan {
  allocations: PaymentAllocation[];
  /** Pesos that no order could take. The screen refuses a payment that leaves any. */
  unallocated: number;
}

export function allocateBillPayment(
  orders: readonly BillOrder[],
  amount: number,
  /** Centavos of this payment that belong to particular orders. */
  preferred: Readonly<Record<string, number>> = {},
): BillPaymentPlan {
  const sorted = sortBillOrders(orders);
  const owed = new Map(sorted.map((order) => [order._id, orderOwedCents(order)]));
  const placed = new Map<string, number>();
  let left = Math.max(0, toCents(amount));

  const place = (orderId: string, wanted: number) => {
    const room = (owed.get(orderId) ?? 0) - (placed.get(orderId) ?? 0);
    const cents = Math.min(left, Math.max(0, wanted), room);
    if (cents <= 0) return;
    placed.set(orderId, (placed.get(orderId) ?? 0) + cents);
    left -= cents;
  };

  for (const order of sorted) place(order._id, preferred[order._id] ?? 0);
  for (const order of sorted) place(order._id, left);

  // Preferred orders first, then the oldest-first remainder, in placing order.
  const preferredIds = sorted.filter((order) => (preferred[order._id] ?? 0) > 0).map((o) => o._id);
  const otherIds = sorted.map((order) => order._id).filter((id) => !preferredIds.includes(id));
  const allocations = [...preferredIds, ...otherIds]
    .filter((id) => (placed.get(id) ?? 0) > 0)
    .map((orderId) => ({ orderId, amount: fromCents(placed.get(orderId) ?? 0) }));

  return { allocations, unallocated: fromCents(left) };
}
