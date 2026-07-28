/**
 * Reading a branch back off an order.
 *
 * The write side (`order-outlet.ts`) records the branch twice: as a real
 * `orders.outlet_id` column on the platform database, and as an id + name pair
 * inside `customer_data` for Convex and tenant-owned Supabase projects, whose
 * schemas this app cannot migrate on demand. Every merchant-facing surface has
 * to read both, or the feature works on one backend and silently disappears on
 * the others.
 *
 * The name is a snapshot taken at order time rather than a live lookup, in the
 * same spirit as `payment_method_name`: renaming a branch must not rewrite the
 * tickets it already took.
 *
 * Nothing here throws or queries. `customer_data` is untyped JSON arriving from
 * three different databases, so every read is defensive — a malformed value
 * degrades to "no branch" rather than breaking a merchant's order list.
 */

import { ORDER_OUTLET_ID_KEY, ORDER_OUTLET_NAME_KEY } from './order-outlet'

/** The dropdown value meaning "do not filter by branch". */
export const OUTLET_FILTER_ALL = 'all'

/** Order-shaped subset needed to read a branch from either backend. */
export interface OutletOrderLike {
  /** Platform Supabase only; absent on Convex and tenant-owned projects. */
  outlet_id?: string | null
  customer_data?: Record<string, unknown> | null
}

/** A branch as it can be offered in the order-list filter. */
export interface OrderOutletOption {
  id: string
  name: string
}

/** Read a trimmed string off untyped JSON, or nothing. */
function readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Which branch took this order.
 *
 * The column wins over the `customer_data` copy: the column is written by the
 * server from a validated id, while the copy exists only so the other two
 * backends have somewhere to put it.
 */
export function getOrderOutletId(order: OutletOrderLike | null | undefined): string | null {
  if (!order) return null

  const fromColumn = typeof order.outlet_id === 'string' ? order.outlet_id.trim() : ''
  if (fromColumn !== '') return fromColumn

  return readString(order.customer_data, ORDER_OUTLET_ID_KEY)
}

/**
 * The branch name to show on the order, as it read when the order was placed.
 *
 * Null when the order predates the feature, belongs to a single-location
 * tenant, or recorded an id with no name — callers render nothing at all in
 * that case rather than an empty badge.
 */
export function getOrderOutletLabel(order: OutletOrderLike | null | undefined): string | null {
  if (!order) return null
  return readString(order.customer_data, ORDER_OUTLET_NAME_KEY)
}

/**
 * The branches worth offering in the order-list filter, sorted by name.
 *
 * Derived from the orders on screen rather than queried, mirroring how the
 * order-type filter is built in `orders-list.tsx` — an empty result means the
 * dropdown does not render, so a single-location merchant sees exactly the
 * order list they see today.
 *
 * A branch whose name was never recorded is skipped: a filter option with no
 * label is unusable. Its orders still appear in the unfiltered list.
 */
export function listOrderOutlets(orders: readonly OutletOrderLike[]): OrderOutletOption[] {
  const byId = new Map<string, string>()

  for (const order of orders) {
    const id = getOrderOutletId(order)
    const name = getOrderOutletLabel(order)
    if (!id || !name) continue
    // First one wins. Orders arrive newest-first, so a renamed branch is
    // offered under the name it goes by now.
    if (!byId.has(id)) byId.set(id, name)
  }

  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Whether an order belongs to the selected branch.
 *
 * An unattributed order is hidden while a branch is selected — it was not taken
 * by that branch, and showing it would defeat the filter.
 */
export function matchesOutletFilter(order: OutletOrderLike | null | undefined, filterId: string): boolean {
  if (filterId === OUTLET_FILTER_ALL) return true
  return getOrderOutletId(order) === filterId
}
