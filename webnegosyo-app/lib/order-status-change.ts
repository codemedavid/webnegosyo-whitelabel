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
 *   - Delivering an order settles it. Most orders are paid at handover, and
 *     before this nothing wrote the payment side, so a delivered order kept its
 *     "Unpaid" chip everywhere. Table orders are the exception — see
 *     {@link isHandoverSettlement}.
 *
 * Pure: no I/O.
 */

import { isHandoverSettlement, isSettledStatus } from "./order-paid-state";

/** Statuses from which there is nothing left to cancel. */
const UNCANCELLABLE_STATUSES: readonly string[] = ["delivered", "cancelled"];

export const DELIVERED_NOT_CANCELLABLE_MESSAGE =
  "This order was already delivered, so it can no longer be cancelled.";

const ALREADY_CANCELLED_MESSAGE = "This order is already cancelled.";

export interface StatusChangeOrder {
  status: string;
  paymentStatus?: string | null;
  customerData?: unknown;
}

export interface StatusChangePlan {
  allowed: boolean;
  /** User-facing copy, shown verbatim. Present only on a refusal. */
  reason?: string;
  /** Write `payment_status = paid` once the status change lands. */
  shouldMarkPaid: boolean;
}

export function canCancelOrder(status: string): boolean {
  return !UNCANCELLABLE_STATUSES.includes(status);
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
      shouldMarkPaid: false,
    };
  }

  const shouldMarkPaid =
    isHandoverSettlement({ status: nextStatus, customerData: order.customerData }) &&
    !isSettledStatus(order.paymentStatus);

  return { allowed: true, shouldMarkPaid };
}

/** The `orders:updatePaymentStatus` mutation, as the screens hold it. */
export type PaymentStatusWriter = (args: {
  orderId: string;
  paymentStatus: string;
}) => Promise<unknown>;

/**
 * Write `paid` on an order that was just handed over.
 *
 * Never throws: the delivery IS recorded, and a failure here must not read as
 * a failed status change. The screens still read a delivered order as settled
 * (see `isOrderUnpaid`), so the chip is right either way — only the web admin
 * and exports wait on this write.
 */
export async function markPaidAfterHandover(
  writePaymentStatus: PaymentStatusWriter,
  orderId: string,
): Promise<void> {
  try {
    await writePaymentStatus({ orderId, paymentStatus: "paid" });
  } catch (err) {
    console.warn("[order] Delivered, but the order still reads unpaid:", err);
  }
}
