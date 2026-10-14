/**
 * A counter sale written LIVE (Convex, online) runs its bookkeeping straight
 * away instead of through the outbox. If its stock call did not land, the sale
 * is handed to the outbox as already written with its reports done, so the
 * outbox retries the stock call alone — durably, across restarts, with the same
 * backoff as a replayed sale (`sync-outbox.ts`).
 */

import { enqueueSale, nextStockRetryAt, type QueuedSale } from "./order-outbox";
import type { PosSaleBookkeepingOutcome } from "./pos-sale-bookkeeping";

export interface KeepOwedStockInput {
  outcome: PosSaleBookkeepingOutcome;
  /** The sale exactly as it would have been queued. */
  sale: Omit<QueuedSale, "attempts" | "lastError">;
  /** The id the server wrote the order under. */
  orderId: string;
}

export interface KeepOwedStockDeps {
  enqueue?: (sale: QueuedSale) => Promise<unknown>;
  now?: () => number;
}

/** The queued form of a written sale that owes only its stock call. */
export function owedStockSale(
  sale: KeepOwedStockInput["sale"],
  orderId: string,
  now: number,
): QueuedSale {
  return {
    ...sale,
    attempts: 0,
    lastError: null,
    syncedOrderId: orderId,
    reportsDone: true,
    bookkeepingDone: false,
    stockAttempts: 1,
    stockRetryAt: nextStockRetryAt(now, 1),
  };
}

/** Never throws: the sale is complete; a failed hand-off is only logged. */
export async function keepOwedStock(
  { outcome, sale, orderId }: KeepOwedStockInput,
  { enqueue = enqueueSale, now = Date.now }: KeepOwedStockDeps = {},
): Promise<void> {
  if (outcome.stock !== "retry") return;
  try {
    await enqueue(owedStockSale(sale, orderId, now()));
  } catch (error) {
    console.warn("[pos] Could not keep the sale's stock call for retry:", error);
  }
}
