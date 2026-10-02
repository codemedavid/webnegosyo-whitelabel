/**
 * The one decision that makes the register offline-first: write the sale
 * now, or keep it on the device and write it later.
 *
 * Order of preference:
 * 0. Written behind (`writeBehind`) → queue immediately, whatever the
 *    connection. The background sync (`use-outbox-sync.ts`) writes it moments
 *    later. Only for a backend whose order id is minted on this device (the
 *    platform database), so the receipt, the kitchen chit and the row all
 *    carry the same id whether the write lands now or in a minute.
 * 1. Believed offline → queue immediately. No 12-second wait at the counter.
 * 2. Otherwise try the write, bounded — the Convex client queues a mutation
 *    forever while disconnected, and forever is a frozen till.
 * 3. The write failed because the server could not be reached → queue. The
 *    idempotency key travels with the queued sale, so an ambiguous failure
 *    (the row landed, the answer did not) replays into the same order.
 * 4. The server REFUSED → rethrow. The cashier sees it, as today.
 *
 * Nothing here prints, navigates or touches the cart; the tender screen does
 * exactly what it did before with the outcome.
 */

import { isOffline as connectivityIsOffline, reportOffline, reportOnline } from "./connectivity";
import { isNetworkFailure } from "./network-error";
import { withDeadline } from "./deadline";
import { enqueueSale, type QueuedSale } from "./order-outbox";

/** How long a write may take before the sale is kept locally instead. */
export const PLACE_SALE_TIMEOUT_MS = 12_000;

export type PlaceSaleOutcome =
  | { kind: "written"; orderId: string }
  | { kind: "queued"; localId: string };

export interface PlaceSaleInput {
  createOrder: (args: unknown) => Promise<unknown>;
  /** The sale as it would be queued; `orderArgs` is also what is sent live. */
  sale: Omit<QueuedSale, "attempts" | "lastError">;
  isOffline?: () => boolean;
  enqueue?: (sale: QueuedSale) => Promise<string | void>;
  timeoutMs?: number;
  /**
   * Hand the till back without waiting on the server at all. The sale is
   * complete the moment it is on disk; three sequential round trips (the
   * idempotency read, the order, its items) move off the counter.
   */
  writeBehind?: boolean;
}

export async function placeCounterSale(input: PlaceSaleInput): Promise<PlaceSaleOutcome> {
  const isOffline = input.isOffline ?? connectivityIsOffline;
  const enqueue = input.enqueue ?? enqueueSale;
  const queued: QueuedSale = { ...input.sale, attempts: 0, lastError: null };

  if (input.writeBehind || isOffline()) {
    const savedId = await enqueue(queued);
    return { kind: "queued", localId: savedId ?? queued.localId };
  }

  try {
    const orderId = await withDeadline(
      input.createOrder(input.sale.orderArgs),
      input.timeoutMs ?? PLACE_SALE_TIMEOUT_MS
    );
    reportOnline();
    return { kind: "written", orderId: String(orderId) };
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    reportOffline();
    const savedId = await enqueue(queued);
    return { kind: "queued", localId: savedId ?? queued.localId };
  }
}
