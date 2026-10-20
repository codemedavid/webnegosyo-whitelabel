/**
 * How long a device keeps owing a stock call, and when it stops.
 *
 * Two queues hold stock calls the platform has not acknowledged yet: the sales
 * outbox (a counter sale's depletion, `sync-outbox.ts`) and the stock-call
 * queue (status changes, order edits, scanned QR sales — `stock-call-queue.ts`).
 * Both settle every attempt through {@link settleStockOutcome}, so their
 * backoff and their cap are one policy rather than two copies.
 *
 * Pure: the caller supplies the clock.
 */

import type { StockPostOutcome } from "../pos-stock-notify";

/** First wait after a stock call that did not land; doubles per attempt. */
export const STOCK_RETRY_BASE_MS = 30_000;
/** The longest wait between two stock attempts. */
export const STOCK_RETRY_MAX_MS = 30 * 60_000;
/**
 * Stock attempts after which an owed call is abandoned (and reported) so it
 * does not sit on the device forever — about a day of retries at the capped
 * interval. The shelf is then reconciled by a stocktake.
 */
export const MAX_STOCK_ATTEMPTS = 48;

/** When to try an owed stock call again, after `attempts` failed tries. */
export function nextStockRetryAt(now: number, attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  return now + Math.min(STOCK_RETRY_BASE_MS * 2 ** exponent, STOCK_RETRY_MAX_MS);
}

/**
 * What to do with an owed stock call after one attempt.
 *
 * - `done`: the platform accepted it — forget it.
 * - `owed`: it may not have landed — keep it, try again at `retryAt`.
 * - `abandoned`: refused for good (`refused`), or out of attempts
 *   (`exhausted`) — forget it, and say so: the shelf is now wrong until a
 *   stocktake, and nobody else will notice.
 *
 * `attempts` in the answer counts the attempt just made.
 */
export type StockSettlement =
  | { verdict: "done" }
  | { verdict: "owed"; attempts: number; retryAt: number }
  | { verdict: "abandoned"; reason: "refused" | "exhausted"; attempts: number };

export function settleStockOutcome(
  entry: { attempts: number },
  outcome: StockPostOutcome,
  now: number,
): StockSettlement {
  if (outcome === "ok") return { verdict: "done" };
  const attempts = entry.attempts + 1;
  if (outcome === "permanent") return { verdict: "abandoned", reason: "refused", attempts };
  if (attempts >= MAX_STOCK_ATTEMPTS) return { verdict: "abandoned", reason: "exhausted", attempts };
  return { verdict: "owed", attempts, retryAt: nextStockRetryAt(now, attempts) };
}
