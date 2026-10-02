/**
 * How many of this store's sales are still waiting to reach the server, as
 * the register's banner should report them.
 *
 * With write-behind every counter sale passes through the outbox for a
 * moment. Counting those would flash the full-width banner after every swipe
 * and shove the screen down, so while online a sale is only "pending" once it
 * is overdue — older than {@link FRESH_SALE_GRACE_MS}, or already refused
 * once. Offline, every queued sale counts: it really is waiting.
 *
 * Pure: the caller supplies the clock.
 */

import type { OrderBackend } from "../order-backend";
import { needsAttention, type QueuedSale } from "./order-outbox";

/** A healthy write lands well inside this; past it, the cashier should know. */
export const FRESH_SALE_GRACE_MS = 10_000;

export interface PendingSaleScope {
  tenantId: string | null;
  backend: OrderBackend;
  now: number;
  isOnline: boolean;
}

export interface PendingSaleSummary {
  /** Still to be written; retried automatically. */
  pending: number;
  /** Refused too many times, or queued under another backend; needs a person. */
  stuck: number;
  /** Sales inside their grace period — the caller re-checks once it passes. */
  hasFreshSales: boolean;
}

export function summarizePendingSales(
  sales: readonly QueuedSale[],
  scope: PendingSaleScope,
): PendingSaleSummary {
  const mine = sales.filter((sale) => sale.tenantId === scope.tenantId);
  const isStuck = (sale: QueuedSale) => needsAttention(sale) || sale.backend !== scope.backend;
  const waiting = mine.filter((sale) => !isStuck(sale));
  const isFresh = (sale: QueuedSale) =>
    scope.isOnline && sale.attempts === 0 && scope.now - sale.createdAt <= FRESH_SALE_GRACE_MS;

  return {
    pending: waiting.filter((sale) => !isFresh(sale)).length,
    stuck: mine.length - waiting.length,
    hasFreshSales: waiting.some(isFresh),
  };
}
