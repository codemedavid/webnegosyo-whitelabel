/**
 * The one cancel side-effect every screen shares: put the order's ingredients
 * back on the shelf.
 *
 * Orders this app manages live in Convex, so cancelling one never reaches the
 * web app's `updateOrderStatus`, where stock is normally restored. The order
 * DETAIL screen fired `notifyOrderStockRestore` itself; the order LIST screen
 * did not, so the same "Cancel Order" button moved stock from one screen and
 * not the other. Centralising the call here makes that divergence impossible.
 *
 * Fire-and-forget by the same reasoning as every stock notify: by the time
 * this runs the cancellation is saved, and a stock write must never make an
 * order un-cancellable. `notifyOrderStockRestore` never throws.
 */

import { useAuthStore } from "../stores/auth-store";
import { notifyOrderStockRestore } from "./pos-stock-notify";

export async function restoreStockForStatusChange(
  newStatus: string,
  orderId: string,
): Promise<void> {
  if (newStatus !== "cancelled") return;

  const tenantId = useAuthStore.getState().tenantId;
  if (!tenantId) return;

  await notifyOrderStockRestore(tenantId, orderId);
}
