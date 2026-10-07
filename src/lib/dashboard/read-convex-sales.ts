/**
 * Sale records from a tenant's own Convex deployment.
 *
 * Convex orders keep the guest's contact, so guests and identified customers
 * are both visible here — unlike the platform ledger, which holds identified
 * orders only. Reads use the deployment's internal queries with its deploy key,
 * the same route `sales-summary.ts` takes.
 *
 * `getOrdersInternal` accepts a time window from schema v32; an older
 * deployment rejects the arguments, which surfaces as a note, not as zeros.
 */

import 'server-only'

import { createConvexServerClient } from '@/lib/convex/server'
import { resolveCustomerIdentity } from '@/lib/customer-identity'
import {
  isCompletedSale,
  toFiniteNumber,
  toOrderTypeLabel,
  toSaleChannel,
  type CustomerVisit,
  type SaleItem,
  type SaleRecord,
} from './sale-record'
import type { SalesReadResult, SalesReadWindow } from './sales-read'

/** Matches the deployment's own QUERY_LIMIT; a full page means the tail is missing. */
const CONVEX_ROW_LIMIT = 10_000

interface ConvexOrderRow {
  _id: string
  _creationTime: number
  total?: number
  status?: string
  paymentStatus?: string
  source?: string
  orderType?: string
  outletId?: string
  customerContact?: string
  customerData?: Record<string, unknown>
}

interface ConvexItemRow {
  orderId: string
  menuItemId?: string
  menuItemName?: string
  quantity?: number
  price?: number
  subtotal?: number
}

export interface ConvexCredentials {
  url: string
  key: string
}

function toSale(row: ConvexOrderRow): SaleRecord {
  return {
    id: row._id,
    at: row._creationTime,
    total: toFiniteNumber(row.total),
    status: row.status ?? '',
    paymentStatus: row.paymentStatus ?? null,
    channel: toSaleChannel(row.source),
    orderType: toOrderTypeLabel(row.orderType),
    outletId: row.outletId ?? null,
    phone: resolveCustomerIdentity({ contact: row.customerContact ?? null, customerData: row.customerData }).phoneE164,
    items: null,
  }
}

function toItem(row: ConvexItemRow): SaleItem {
  const quantity = toFiniteNumber(row.quantity)
  return {
    menuItemId: row.menuItemId?.trim() || null,
    name: row.menuItemName ?? '',
    quantity,
    revenue: row.subtotal !== undefined ? toFiniteNumber(row.subtotal) : toFiniteNumber(row.price) * quantity,
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

/** A query that may fail on its own without failing the dashboard. */
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

function settle<T>(query: Promise<T>): Promise<Settled<T>> {
  return query.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

export async function readConvexSales(
  credentials: ConvexCredentials,
  window: SalesReadWindow,
): Promise<SalesReadResult> {
  const client = createConvexServerClient(credentials.url, credentials.key)
  const branch = window.outletId ? { outletId: window.outletId } : {}

  // Three independent queries, issued together instead of one after another.
  // NOTE: `getAllOrderItemsInternal` takes no window, so it returns every line
  // item the store has ever had and is filtered here; giving it a window is a
  // Convex schema change (and a deploy to every tenant), not a web change.
  const [orders, items, prior] = await Promise.all([
    settle(
      client.query<ConvexOrderRow[]>('orders:getOrdersInternal', {
        startMs: window.readStart,
        endMs: window.now + 1,
        limit: CONVEX_ROW_LIMIT,
        ...branch,
      }),
    ),
    window.includeItems ? settle(client.query<ConvexItemRow[]>('orders:getAllOrderItemsInternal', {})) : null,
    window.includePriorVisits
      ? settle(
          client.query<ConvexOrderRow[]>('orders:getOrdersInternal', {
            startMs: 0,
            endMs: window.readStart,
            limit: CONVEX_ROW_LIMIT,
            ...branch,
          }),
        )
      : null,
  ])

  if (!orders.ok) {
    return {
      sales: [],
      priorVisits: [],
      notes: [`This store's Convex orders could not be read (${messageOf(orders.error)}). Deploying the latest schema may fix it.`],
      failed: true,
    }
  }

  const rows = orders.value
  const notes: string[] = []
  if (rows.length >= CONVEX_ROW_LIMIT) notes.push('This store has more orders than one read can hold; older days are partial.')

  let sales = rows.map(toSale)
  if (items) {
    if (items.ok) {
      const wanted = new Set(sales.filter((s) => s.at >= window.currentStart && isCompletedSale(s)).map((s) => s.id))
      const byOrder = new Map<string, SaleItem[]>()
      for (const item of items.value) {
        if (!wanted.has(item.orderId)) continue
        byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), toItem(item)])
      }
      sales = sales.map((sale) => (wanted.has(sale.id) ? { ...sale, items: byOrder.get(sale.id) ?? [] } : sale))
      // Newest-first and capped: a full page means the window's oldest lines may be missing.
      if (items.value.length >= CONVEX_ROW_LIMIT) {
        notes.push('This store has more order lines than one read can hold; top items may undercount older days.')
      }
    } else {
      notes.push(`Order items could not be read, so top items are unavailable (${messageOf(items.error)}).`)
    }
  }

  let priorVisits: CustomerVisit[] = []
  if (prior?.ok) {
    priorVisits = prior.value
      .map(toSale)
      .flatMap((sale) => (sale.phone && isCompletedSale(sale) ? [{ phone: sale.phone, at: sale.at }] : []))
    if (prior.value.length >= CONVEX_ROW_LIMIT) notes.push('Only recent customer history was read; some regulars may show as first-timers.')
  } else if (prior) {
    notes.push(`Earlier customer history could not be read, so some regulars may show as first-timers (${messageOf(prior.error)}).`)
  }

  return { sales, priorVisits, notes, failed: false }
}
