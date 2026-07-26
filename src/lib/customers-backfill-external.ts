/**
 * Convex → customer-capture mapping for the external backfill.
 *
 * Going-forward capture (see `customer-external-orders.ts`) only helps from the
 * moment it ships. Convex tenants have months of existing orders whose phone
 * numbers exist ONLY in their Convex deployment, so recovering those needs a
 * one-off sweep. The sweep's I/O is thin script glue; the shape mapping lives
 * here so it is unit-tested independently of any live deployment.
 */
import type { ExternalOrderInput } from '@/lib/customer-external-orders'
import type { CustomerOrderItemInput } from '@/lib/customer-identity'

/** The subset of a Convex `orders` document the capture needs. */
export interface ConvexOrderRow {
  _id: string
  /** Convex creation timestamp, epoch milliseconds. */
  _creationTime: number
  customerName?: string | null
  customerContact?: string | null
  customerData?: Record<string, unknown> | null
  total?: number | null
  orderType?: string | null
  status?: string | null
}

/** The subset of a Convex `orderItems` document the top-items tally needs. */
export interface ConvexOrderItemRow {
  orderId: string
  menuItemName?: string | null
  quantity?: number | null
}

/**
 * Bucket line items by their order id in one pass, so the sweep can pair items
 * with orders without an N+1 query per order.
 */
export function groupConvexItemsByOrder(
  items: ConvexOrderItemRow[]
): Map<string, CustomerOrderItemInput[]> {
  const grouped = new Map<string, CustomerOrderItemInput[]>()

  for (const item of items) {
    const name = item.menuItemName?.trim()
    if (!name) continue

    const bucket = grouped.get(item.orderId) ?? []
    grouped.set(item.orderId, [...bucket, { name, quantity: Number(item.quantity) || 0 }])
  }

  return grouped
}

/**
 * Map one Convex order onto the capture input. `customerData` is carried through
 * untouched so identity resolution can still recover a phone from a legacy order
 * whose `customerContact` was left blank or placeholder.
 */
export function mapConvexOrderToExternalInput(
  order: ConvexOrderRow,
  items: CustomerOrderItemInput[]
): ExternalOrderInput {
  return {
    backend: 'convex',
    externalOrderId: order._id,
    name: order.customerName ?? null,
    contact: order.customerContact ?? null,
    customerData: order.customerData ?? null,
    total: Number(order.total) || 0,
    createdAt: order._creationTime,
    channel: order.orderType ?? null,
    items,
  }
}
