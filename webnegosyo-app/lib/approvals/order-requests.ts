/**
 * Approvals on the order screen — pure. Which of my requests the live card
 * shows, which entry buttons an order offers, and the order as the request
 * sheet needs it.
 */
import { shouldKeepPolling } from "./state";
import type { RequestOrder } from "./request-draft";
import type { ApprovalRequestView } from "./types";

/** A final answer stays on the order screen this long (or until "Done"). */
export const FINAL_CARD_MS = 60 * 60 * 1000;
/** Statuses an order can no longer be cancelled from (mirrors order-status-change). */
const UNCANCELLABLE = new Set(["delivered", "cancelled"]);

export function orderRequestToShow(
  requests: readonly ApprovalRequestView[],
  orderId: string,
  now: Date,
  dismissedIds: readonly string[],
): ApprovalRequestView | null {
  const [latest] = requests
    .filter((request) => request.externalOrderId === orderId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!latest || dismissedIds.includes(latest.id)) return null;
  if (shouldKeepPolling(latest)) return latest;
  return now.getTime() - Date.parse(latest.updatedAt) <= FINAL_CARD_MS ? latest : null;
}

export interface OrderEntryInput {
  isApprovalsStore: boolean;
  canAsk: boolean;
  /** Holds `orders`: cancels directly, so is never offered "Ask to cancel". */
  holdsOrders: boolean;
  isUnpaid: boolean;
  refundable: number;
  status: string;
  /** A request of mine on this order is still waiting or finishing. */
  hasActiveRequest: boolean;
}

export function orderEntries(input: OrderEntryInput): { canRefund: boolean; canAskToCancel: boolean } {
  const isOpen = input.isApprovalsStore && input.canAsk && !input.hasActiveRequest && !input.isUnpaid && input.refundable > 0;
  return {
    canRefund: isOpen,
    canAskToCancel: isOpen && !input.holdsOrders && !UNCANCELLABLE.has(input.status),
  };
}

export interface OrderForRequest {
  id: string;
  label: string | null;
  refundable: number;
  paymentLabel: string | null;
  createdAt: string | null;
  outletId: string | null;
  items: readonly { _id?: string; menuItemName: string; quantity: number; subtotal: number }[];
}

export function toRequestOrder(order: OrderForRequest): RequestOrder {
  return {
    orderId: order.id,
    orderLabel: order.label,
    refundable: order.refundable,
    paymentLabel: order.paymentLabel ? (/^cash\b/i.test(order.paymentLabel) ? "cash" : order.paymentLabel) : null,
    createdAt: order.createdAt,
    outletId: order.outletId,
    items: order.items
      .filter((item): item is typeof item & { _id: string } => typeof item._id === "string" && item._id !== "")
      .map((item) => ({ id: item._id, name: item.menuItemName, quantity: item.quantity, lineTotal: item.subtotal })),
  };
}
