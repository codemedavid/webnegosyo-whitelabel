/**
 * After a switch: what a fresh snapshot of the old deployment holds that the
 * imported snapshot did not — a register that kept an old session open, a
 * payment recorded late, an edit. Counts, totals and dates only.
 */
import { toCents } from '@/lib/reports/money'
import { orderBusinessTime } from './plan'
import type { ConvexSnapshot } from './types'

export interface DeltaReport {
  importedNewest: string | null
  newOrders: { count: number; cents: number; first: string | null; last: string | null }
  /** Payments / edits / lines added to orders that were already imported. */
  latePayments: number
  lateRevisions: number
  /** Imported orders whose lines changed in Convex since (an edit replaces lines): need a hand fix. */
  ordersWithChangedLines: number
  /** Imported orders no longer in Convex (deleted there). */
  ordersGoneFromConvex: number
  isEmpty: boolean
}

export function computeDelta(imported: ConvexSnapshot, fresh: ConvexSnapshot): DeltaReport {
  const importedOrders = new Set(imported.orders.map((order) => order._id))
  const importedPayments = new Set(imported.orderPayments.map((payment) => payment._id))
  const importedRevisions = new Set(imported.orderRevisions.map((revision) => revision._id))
  const linesOf = (snapshot: ConvexSnapshot) => {
    const map = new Map<string, string[]>()
    for (const item of snapshot.orderItems) {
      const list = map.get(item.orderId) ?? []
      list.push(item._id)
      map.set(item.orderId, list)
    }
    for (const list of map.values()) list.sort()
    return map
  }
  const beforeLines = linesOf(imported)
  const afterLines = linesOf(fresh)

  const newOrders = fresh.orders.filter((order) => !importedOrders.has(order._id))
  const times = newOrders.map(orderBusinessTime)
  const freshIds = new Set(fresh.orders.map((order) => order._id))
  let changed = 0
  for (const id of importedOrders) {
    if (!freshIds.has(id)) continue
    const before = (beforeLines.get(id) ?? []).join(',')
    const after = (afterLines.get(id) ?? []).join(',')
    if (before !== after) changed++
  }
  const latePayments = fresh.orderPayments.filter((p) => importedOrders.has(p.orderId) && !importedPayments.has(p._id)).length
  const lateRevisions = fresh.orderRevisions.filter((r) => importedOrders.has(r.orderId) && !importedRevisions.has(r._id)).length
  const gone = [...importedOrders].filter((id) => !freshIds.has(id)).length
  const newest = Math.max(
    0,
    ...imported.orders.map((o) => o._creationTime),
    ...imported.orderPayments.map((p) => p._creationTime),
    ...imported.orderRevisions.map((r) => r._creationTime)
  )
  return {
    importedNewest: newest > 0 ? new Date(newest).toISOString() : null,
    newOrders: {
      count: newOrders.length,
      cents: newOrders.reduce((sum, order) => sum + toCents(order.total ?? 0), 0),
      first: times.length ? new Date(Math.min(...times)).toISOString() : null,
      last: times.length ? new Date(Math.max(...times)).toISOString() : null,
    },
    latePayments,
    lateRevisions,
    ordersWithChangedLines: changed,
    ordersGoneFromConvex: gone,
    isEmpty: newOrders.length === 0 && latePayments === 0 && lateRevisions === 0 && changed === 0 && gone === 0,
  }
}
