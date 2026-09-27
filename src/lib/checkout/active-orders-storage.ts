/**
 * The browser's list of orders placed on this device, per tenant, which the
 * order-tracking banner reads (see use-order-tracking.ts).
 */
export const ACTIVE_ORDERS_STORAGE_PREFIX = 'active_orders_'

export interface ActiveOrderEntry {
  orderId: string
  trackingToken: string
  createdAt: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function readEntries(storage: StorageLike, key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) || '[]')
    // Anything but an array (a hand-edited or corrupted value) starts over
    // rather than throwing on `.some` and losing the new order's entry.
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hasOrder(entries: readonly unknown[], orderId: string): boolean {
  return entries.some(
    (entry) => typeof entry === 'object' && entry !== null && (entry as { orderId?: unknown }).orderId === orderId
  )
}

/**
 * Adds an order to the tenant's tracking list, once. Storage failures (private
 * mode, quota) are swallowed: tracking is a convenience, the order is saved.
 */
export function rememberActiveOrder(storage: StorageLike, tenantSlug: string, entry: ActiveOrderEntry): void {
  const key = `${ACTIVE_ORDERS_STORAGE_PREFIX}${tenantSlug}`
  const entries = readEntries(storage, key)
  if (hasOrder(entries, entry.orderId)) return
  try {
    storage.setItem(key, JSON.stringify([...entries, entry]))
  } catch {
    // Quota or private mode — see above.
  }
}
