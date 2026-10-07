/**
 * One real order, two records — the rule for counting it once.
 *
 * Convex→platform history imports copied each Convex order into `orders` and
 * stamped the original Convex id into `customer_data.convex_order_id`. Some of
 * those orders had ALREADY been projected into `customer_external_orders`
 * while the store still ran on Convex, under `backend = 'convex'` and
 * `external_order_id` = that same Convex id.
 *
 * Every reader that unions the two tables, and every earning path that keys
 * on (backend, order id), must treat the pair as one order. The platform row
 * wins: it is the store's current home, it carries the full line items, and
 * it is what the order screen opens.
 */

import type { CustomerOrderFact } from '@/lib/customer-order-facts'

/** The `customer_data` key the history imports stamp the Convex id under. */
export const CONVEX_ORIGIN_KEY = 'convex_order_id'

export interface OrderSourceRef {
  backend: CustomerOrderFact['backend']
  externalOrderId: string
}

/**
 * The other record of the same real order. `isPrimary` is true when the twin
 * is the copy that wins (the platform row), so THIS record must stand aside.
 */
export interface ImportTwin {
  ref: OrderSourceRef
  isPrimary: boolean
}

/** The Convex id an imported platform order carries, or null for a native one. */
export function convexOriginOf(customerData: unknown): string | null {
  if (!customerData || typeof customerData !== 'object') return null
  const value = (customerData as Record<string, unknown>)[CONVEX_ORIGIN_KEY]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

interface PlatformSourceRow {
  customer_data?: unknown
}

interface LedgerSourceRow {
  backend?: unknown
  external_order_id?: unknown
}

/**
 * Drop each ledger row whose order the platform rows also hold. Pure; returns
 * new arrays. Only Convex ledger rows can be twins — the imports copied Convex
 * history, and a tenant-Supabase id sharing the string is a different order.
 */
export function dedupeOrderSources<P extends PlatformSourceRow, L extends LedgerSourceRow>(
  platform: readonly P[],
  ledger: readonly L[],
): { platform: P[]; ledger: L[] } {
  const imported = new Set(
    platform.map((row) => convexOriginOf(row.customer_data)).filter((id): id is string => id !== null),
  )
  const isTwin = (row: L): boolean =>
    row.backend === 'convex' && typeof row.external_order_id === 'string' && imported.has(row.external_order_id)

  return { platform: [...platform], ledger: ledger.filter((row) => !isTwin(row)) }
}
