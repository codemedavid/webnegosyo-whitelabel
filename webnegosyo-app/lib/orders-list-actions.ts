/**
 * Decisions the Orders tab makes around its actions, kept pure so they are
 * testable without the screen.
 *
 * - The busy set: which orders have a status change in flight. A double-tap
 *   used to fire the mutation twice — and with it two stock restores and two
 *   Loyverse receipts.
 * - The export source: which page of orders backs an export, and the cap to
 *   judge its coverage against. The queue's own page is a fallback while the
 *   deep read is in flight, and its coverage must be reported against the rows
 *   it really holds, not the deep read's cap.
 */

export interface BusyClaim {
  /** False when the order already had a change in flight — do nothing. */
  isClaimed: boolean;
  /** The set to carry forward; unchanged (same reference) when not claimed. */
  busy: ReadonlySet<string>;
}

export function claimOrderBusy(busy: ReadonlySet<string>, orderId: string): BusyClaim {
  if (busy.has(orderId)) return { isClaimed: false, busy };
  return { isClaimed: true, busy: new Set([...busy, orderId]) };
}

export function releaseOrderBusy(busy: ReadonlySet<string>, orderId: string): ReadonlySet<string> {
  if (!busy.has(orderId)) return busy;
  return new Set([...busy].filter((id) => id !== orderId));
}

export interface ExportSource<T> {
  orders: readonly T[];
  /** The cap `resolveExportCoverage` judges truncation against. */
  fetchLimit: number;
  /** True when the deep export page (not the queue's own page) backs the file. */
  isDeepRead: boolean;
}

/**
 * Prefer the deep export page once it has landed (an empty array counts —
 * the read answered). Until then, the queue's page stands in, and its cap is
 * its own length so a capped page is reported as capped.
 */
export function resolveExportSource<T>(
  deepOrders: readonly T[] | undefined,
  queueOrders: readonly T[] | undefined,
  deepFetchLimit: number,
): ExportSource<T> {
  if (deepOrders !== undefined) {
    return { orders: deepOrders, fetchLimit: deepFetchLimit, isDeepRead: true };
  }
  const orders = queueOrders ?? [];
  return { orders, fetchLimit: orders.length, isDeepRead: false };
}
