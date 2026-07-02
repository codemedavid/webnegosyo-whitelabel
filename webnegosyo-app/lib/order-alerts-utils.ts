// Pure, framework-free helpers behind the new-order ringtone alert. Kept out of
// the hook so the alert-trigger logic (skip the initial snapshot, then ring only
// for genuinely new orders) is unit-testable without a React Native harness.

export interface AlertableOrder {
  _id: string;
  customerName?: string;
  total?: number;
  itemCount?: number;
}

/**
 * Orders that are newly arrived relative to the set of ids already seen.
 *
 * `prevIds === null` represents the very first snapshot after mount — we return
 * nothing so the initial load never rings. `orders === undefined` means the
 * query is still loading; also nothing to alert on.
 */
export function selectNewOrders(
  prevIds: Set<string> | null,
  orders: readonly AlertableOrder[] | undefined
): AlertableOrder[] {
  if (prevIds === null || !orders) return [];
  return orders.filter((order) => !prevIds.has(order._id));
}

/** Human-readable alert body, e.g. "Maria — ₱250.00 (3 items)". */
export function formatOrderAlertBody(order: AlertableOrder): string {
  const name = order.customerName ?? "Customer";
  const total = (order.total ?? 0).toFixed(2);
  const count = order.itemCount ?? 0;
  return `${name} — ₱${total} (${count} item${count !== 1 ? "s" : ""})`;
}
