/**
 * The one decision that makes the register offline-first: write the sale
 * now, or keep it on the device and write it later.
 *
 * Order of preference, deliberately server-first:
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
  enqueue?: (sale: QueuedSale) => Promise<void>;
  timeoutMs?: number;
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The request timed out (orders:createOrder). Check your connection and try again.")),
      timeoutMs
    );
  });
  return Promise.race([work, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function placeCounterSale(input: PlaceSaleInput): Promise<PlaceSaleOutcome> {
  const isOffline = input.isOffline ?? connectivityIsOffline;
  const enqueue = input.enqueue ?? enqueueSale;
  const queued: QueuedSale = { ...input.sale, attempts: 0, lastError: null };

  if (isOffline()) {
    await enqueue(queued);
    return { kind: "queued", localId: queued.localId };
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
    await enqueue(queued);
    return { kind: "queued", localId: queued.localId };
  }
}
