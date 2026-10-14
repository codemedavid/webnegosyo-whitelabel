/**
 * The one stock side-effect every status change shares.
 *
 * - An order moving INTO `cancelled` puts its ingredients back (`restore`).
 * - An order moving OUT of `cancelled` to any active status spends again
 *   exactly what the cancellation returned (`redeplete`) — without this a
 *   reinstated order sold its dishes without taking anything off the shelf.
 *
 * Orders this app manages are written to the order backend directly, so a
 * status change never reaches the web app's `updateOrderStatus`, where stock
 * is otherwise moved. Every screen that changes a status — order list, order
 * detail, kitchen board, register drawer, pickup scan, and the offline replay —
 * calls this with the status the order had BEFORE, so they cannot diverge.
 *
 * Retried in the process with backoff on a transient failure (the server's
 * per-order claims make a repeat a no-op). Never throws, and callers do not
 * await it on a screen: by the time it runs the status change is saved, and a
 * stock write must never make an order un-cancellable or a ticket un-bumpable.
 */

import { useAuthStore } from "../stores/auth-store";
import {
  notifyOrderStockRedeplete,
  notifyOrderStockRestore,
  withStockRetry,
  type StockPostOutcome,
  type StockRetryOptions,
} from "./pos-stock-notify";

const CANCELLED = "cancelled";

export type StatusStockAction = "restore" | "redeplete";

export interface StatusStockChange {
  orderId: string;
  newStatus: string;
  /** The status the order had before this change; absent when unknown. */
  previousStatus?: string | null;
}

/**
 * Which stock action a status change calls for. An unknown previous status
 * still restores on a cancel (the platform refuses a restore for an order that
 * is not cancelled, and a repeat is a no-op), but never redeplete: re-spending
 * is only right for an order known to have been cancelled.
 */
export function stockActionForStatusChange(
  previousStatus: string | null | undefined,
  newStatus: string,
): StatusStockAction | null {
  const wasCancelled = previousStatus === CANCELLED;
  const isCancelled = newStatus === CANCELLED;
  if (isCancelled && !wasCancelled) return "restore";
  if (wasCancelled && !isCancelled) return "redeplete";
  return null;
}

export async function syncStockForStatusChange(
  change: StatusStockChange,
  retry?: StockRetryOptions,
): Promise<StockPostOutcome | null> {
  const action = stockActionForStatusChange(change.previousStatus, change.newStatus);
  if (!action) return null;

  const auth = useAuthStore.getState();
  const tenantId = auth.impersonatedTenantId ?? auth.tenantId;
  if (!tenantId) return null;

  const notify = action === "restore" ? notifyOrderStockRestore : notifyOrderStockRedeplete;
  // One order's stock calls run strictly in order. A cancel and an immediate
  // reinstate (or two queued offline changes replayed together) fired
  // concurrently could reach the server as redeplete-then-restore: both are
  // refused against the order's real status and neither is retried.
  const previous = inFlightByOrder.get(change.orderId) ?? Promise.resolve(null);
  const next = previous
    .catch(() => null)
    .then(() => withStockRetry(() => notify(tenantId, change.orderId, "merchant_app"), retry));
  inFlightByOrder.set(change.orderId, next);
  try {
    return await next;
  } finally {
    if (inFlightByOrder.get(change.orderId) === next) inFlightByOrder.delete(change.orderId);
  }
}

/** The tail of each order's stock-call chain; see `syncStockForStatusChange`. */
const inFlightByOrder = new Map<string, Promise<StockPostOutcome | null>>();
