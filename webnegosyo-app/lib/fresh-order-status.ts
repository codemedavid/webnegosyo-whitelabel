/**
 * An order's status as the SERVER holds it right now, for a write that must
 * not trust a screen's copy.
 *
 * The kitchen board reads a polled / realtime list that can be seconds behind.
 * Bumping a ticket cancelled at the counter wrote it back to `ready`, which
 * resurrected the order with its stock already restored by the cancel — and,
 * with the board's stale status as "before", nothing ever spent it again. The
 * board now asks the server first and refuses to touch a cancelled order.
 *
 * Pure core + a thin hook (`useFreshOrderStatus`, in `use-fresh-order-status.ts`).
 */

import type { RefRoute } from "./backends/route";

const CANCELLED = "cancelled";

/** Short: a cook is waiting on the bump. */
export const FRESH_STATUS_TIMEOUT_MS = 4_000;

export interface FreshOrderStatusDeps {
  route: RefRoute;
  /** Known offline: answer at once instead of making the cook wait it out. */
  isOffline?: boolean;
  queryPlatform: (args: { orderId: string }) => Promise<unknown>;
  queryConvex: (args: { orderId: string }) => Promise<unknown>;
  timeoutMs?: number;
}

function statusOf(order: unknown): string | null {
  if (!order || typeof order !== "object") return null;
  const status = (order as { status?: unknown }).status;
  return typeof status === "string" && status.length > 0 ? status : null;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

/**
 * The server's status for `orderId`, or null when it cannot be found out
 * (offline, timed out, a device-only order, no backend). Never throws.
 */
export async function fetchFreshOrderStatus(
  orderId: string,
  { route, isOffline = false, queryPlatform, queryConvex, timeoutMs = FRESH_STATUS_TIMEOUT_MS }: FreshOrderStatusDeps,
): Promise<string | null> {
  if (isOffline) return null;
  const query = route === "platform" ? queryPlatform : route === "convex" ? queryConvex : null;
  if (!query) return null;
  try {
    return statusOf(await withTimeout(query({ orderId }), timeoutMs));
  } catch {
    return null;
  }
}

export type KitchenStatusGuard =
  | { allow: true; previousStatus: string | undefined }
  | { allow: false; message: string };

export const CANCELLED_TICKET_MESSAGE = "This order was cancelled elsewhere — reinstate it from the order screen.";

/**
 * Whether a board-driven status write may go ahead, and the status to hand the
 * stock sync as the order's "before". Unknown server status (offline) falls
 * back to the board's: the write is queued on the device then, and the replay
 * carries the same previous status.
 */
export function guardKitchenStatusWrite({
  boardStatus,
  freshStatus,
}: {
  boardStatus: string | undefined;
  freshStatus: string | null;
}): KitchenStatusGuard {
  if (freshStatus === CANCELLED) return { allow: false, message: CANCELLED_TICKET_MESSAGE };
  return { allow: true, previousStatus: freshStatus ?? boardStatus };
}
