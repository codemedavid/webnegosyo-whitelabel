/**
 * What a status change is allowed to do, and what it must write alongside.
 *
 * Two rules every status surface (order screen, order list, pickup scan) must
 * agree on, so they live here rather than on the screens — Jest cannot import
 * `app/`:
 *
 *   - A delivered order cannot be cancelled. The customer has the food;
 *     cancelling it would pull the sale out of revenue and put its ingredients
 *     back on the shelf.
 *   - A status change never writes the payment on its own. Handing over an
 *     unpaid order goes through the order screen's payment question
 *     (`use-order-payment-flow.ts`), which records HOW it was paid before the
 *     order is marked paid. Writing `paid` here, with no method and no ledger
 *     row, filed Koko Coffee's pay-later sales under "Paid, method not picked"
 *     (2026-11-24); `tests/paid-writes.test.ts` keeps it from coming back.
 *
 * Pure: no I/O.
 */

import { settlementIntent } from "./order-balance";
import { isHandoverSettlement, isSettledStatus } from "./order-paid-state";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

/** Statuses from which there is nothing left to cancel. */
const UNCANCELLABLE_STATUSES: readonly string[] = ["delivered", "cancelled"];

export const DELIVERED_NOT_CANCELLABLE_MESSAGE =
  "This order was already delivered, so it can no longer be cancelled.";

const ALREADY_CANCELLED_MESSAGE = "This order is already cancelled.";

export interface StatusChangeOrder {
  status: string;
  paymentStatus?: string | null;
  customerData?: unknown;
  total?: number | null;
  /** Net of the settlement ledger, when the screen holds it. */
  amountPaid?: number | null;
}

export interface StatusChangePlan {
  allowed: boolean;
  /** User-facing copy, shown verbatim. Present only on a refusal. */
  reason?: string;
  /**
   * Write `payment_status = paid` once the order is handed over — ONLY when
   * the ledger already holds the whole bill, so the row catches up with money
   * that is recorded under its methods. Never for a bill nobody recorded.
   */
  shouldSyncPaid: boolean;
}

export function canCancelOrder(status: string): boolean {
  return !UNCANCELLABLE_STATUSES.includes(status);
}

/**
 * Whether THIS account may be offered Cancel on an order in `status`.
 *
 * Cancelling takes the sale out of revenue and puts its stock back, so it is
 * the `orders` grant's authority — `kitchen`, `tables` and `pos` are carved
 * out of the queue precisely without it. The database refuses the write for
 * anyone else (orders_client_status_guard); hiding the button keeps a cashier
 * from meeting that refusal. Phase 3 adds "Ask a manager" in its place.
 */
export function canUserCancelOrder(user: StaffPermissionHolder, status: string): boolean {
  return canCancelOrder(status) && hasPermission(user, "orders");
}

export function planOrderStatusChange(
  order: StatusChangeOrder,
  nextStatus: string,
): StatusChangePlan {
  if (nextStatus === "cancelled" && !canCancelOrder(order.status)) {
    return {
      allowed: false,
      reason:
        order.status === "cancelled"
          ? ALREADY_CANCELLED_MESSAGE
          : DELIVERED_NOT_CANCELLABLE_MESSAGE,
      shouldSyncPaid: false,
    };
  }

  return { allowed: true, shouldSyncPaid: isLedgerSquareAtHandover(order, nextStatus) };
}

/** Handed over, row still unpaid, and the ledger already covers the total. */
export function isLedgerSquareAtHandover(order: StatusChangeOrder, nextStatus: string): boolean {
  if (!isHandoverSettlement({ status: nextStatus, customerData: order.customerData })) return false;
  if (isSettledStatus(order.paymentStatus)) return false;
  const paid = order.amountPaid;
  const total = order.total;
  if (typeof paid !== "number" || !Number.isFinite(paid) || paid <= 0) return false;
  if (typeof total !== "number" || !Number.isFinite(total)) return false;
  return settlementIntent(total - paid) !== "collect";
}

/** The `orders:updatePaymentStatus` mutation, as the screens hold it. */
export type PaymentStatusWriter = (args: {
  orderId: string;
  paymentStatus: string;
}) => Promise<unknown>;

/**
 * Catch the row up with a ledger that already holds the whole bill
 * ({@link StatusChangePlan.shouldSyncPaid}). Never throws: the delivery IS
 * recorded, and the money is on the ledger under its methods either way.
 */
export async function syncPaidAfterHandover(
  writePaymentStatus: PaymentStatusWriter,
  orderId: string,
): Promise<void> {
  try {
    await writePaymentStatus({ orderId, paymentStatus: "paid" });
  } catch (err) {
    console.warn("[order] Delivered, but the order still reads unpaid:", err);
  }
}
