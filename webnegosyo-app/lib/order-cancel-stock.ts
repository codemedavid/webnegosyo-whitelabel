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
 * Stored on the device before it is sent and retried with backoff until the
 * platform answers for good (`offline/drain-stock-calls.ts`; the server's
 * per-order claims make a repeat a no-op). One order's calls are sent in the
 * order they were made — a cancel and an immediate reinstate can never reach
 * the server as redeplete-then-restore. Never throws, and resolves once the
 * call is stored, not sent: by the time it runs the status change is saved,
 * and a stock write must never make an order un-cancellable or a ticket
 * un-bumpable.
 */

import { useAuthStore } from "../stores/auth-store";
import { sendStockCall } from "./offline/drain-stock-calls";

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

export interface StatusStockDeps {
  send?: typeof sendStockCall;
}

/** Answers the action queued, or null when the change moves no stock. */
export async function syncStockForStatusChange(
  change: StatusStockChange,
  { send = sendStockCall }: StatusStockDeps = {},
): Promise<StatusStockAction | null> {
  const action = stockActionForStatusChange(change.previousStatus, change.newStatus);
  if (!action) return null;

  const auth = useAuthStore.getState();
  const tenantId = auth.impersonatedTenantId ?? auth.tenantId;
  if (!tenantId) return null;

  await send({ tenantId, orderId: change.orderId, action, payload: { source: "merchant_app" } });
  return action;
}
