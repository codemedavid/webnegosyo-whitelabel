/**
 * Sale records from a Supabase `orders` table — the shared platform project or
 * a tenant's own order project (same schema).
 *
 * Two independent reads, run concurrently, both paged past PostgREST's
 * 1000-row cap (`paged-read.ts`):
 *  - every order from `readStart` on, guests included, for the reporting
 *    windows; line items only for the current window's completed sales;
 *  - before `readStart`, only identified completed visits, because the Growth
 *    classifier needs to know whether a phone has ever bought here before —
 *    skipped unless `includePriorVisits` (the Overview never uses them).
 *
 * A failed read is reported in `notes`, never rendered as zero sales.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
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
import { readPagesConcurrently, type PageReader } from './paged-read'

const PAGE_SIZE = 1000
/** Bounds a request's memory; larger histories are disclosed as partial. */
const MAX_ROWS = 60_000
const ITEM_CHUNK = 150
const ITEM_CONCURRENCY = 4

const ORDER_SELECT = 'id, customer_contact, status, payment_status, source, order_type, outlet_id, total, created_at'
const VISIT_SELECT = 'customer_contact, status, payment_status, source, total, created_at'
const ITEM_SELECT = 'order_id, menu_item_id, menu_item_name, quantity, price, subtotal'

interface OrderRow {
  id: string
  customer_contact: string | null
  status: string | null
  payment_status: string | null
  source: string | null
  order_type: string | null
  outlet_id: string | null
  total: number | string | null
  created_at: string
}

interface ItemRow {
  order_id: string
  menu_item_id: string | null
  menu_item_name: string | null
  quantity: number | string | null
  price: number | string | null
  subtotal: number | string | null
}

/** Page batches read at once once a history overflows its first page. */
const PAGE_CONCURRENCY = 4

function readPages<T>(page: PageReader<T>) {
  return readPagesConcurrently(page, { pageSize: PAGE_SIZE, maxRows: MAX_ROWS, concurrency: PAGE_CONCURRENCY })
}

function phoneOf(contact: string | null): string | null {
  return resolveCustomerIdentity({ contact }).phoneE164
}

function toSale(row: OrderRow): SaleRecord {
  return {
    id: row.id,
    at: Date.parse(row.created_at),
    total: toFiniteNumber(row.total),
    status: row.status ?? '',
    paymentStatus: row.payment_status,
    channel: toSaleChannel(row.source),
    orderType: toOrderTypeLabel(row.order_type),
    outletId: row.outlet_id,
    phone: phoneOf(row.customer_contact),
    items: null,
  }
}

function toItem(row: ItemRow): SaleItem {
  const quantity = toFiniteNumber(row.quantity)
  const subtotal = row.subtotal === null ? null : toFiniteNumber(row.subtotal)
  return {
    menuItemId: row.menu_item_id,
    name: row.menu_item_name ?? '',
    quantity,
    revenue: subtotal ?? toFiniteNumber(row.price) * quantity,
  }
}

async function readItems(
  client: SupabaseClient,
  orderIds: string[],
): Promise<{ byOrder: Map<string, SaleItem[]>; error: string | null }> {
  const chunks: string[][] = []
  for (let i = 0; i < orderIds.length; i += ITEM_CHUNK) chunks.push(orderIds.slice(i, i + ITEM_CHUNK))

  const byOrder = new Map<string, SaleItem[]>()
  for (let i = 0; i < chunks.length; i += ITEM_CONCURRENCY) {
    const results = await Promise.all(
      chunks.slice(i, i + ITEM_CONCURRENCY).map((ids) =>
        readPages<ItemRow>((from, to) =>
          client.from('order_items').select(ITEM_SELECT).in('order_id', ids).order('id').range(from, to),
        ),
      ),
    )
    const failed = results.find((result) => result.error)
    if (failed) return { byOrder: new Map(), error: failed.error }
    for (const row of results.flatMap((result) => result.rows)) {
      byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), toItem(row)])
    }
  }
  return { byOrder, error: null }
}

async function readPriorVisits(
  client: SupabaseClient,
  tenantId: string,
  window: SalesReadWindow,
): Promise<{ visits: CustomerVisit[]; note: string | null }> {
  const result = await readPages<Omit<OrderRow, 'id' | 'order_type' | 'outlet_id'>>((from, to) => {
    let query = client
      .from('orders')
      .select(VISIT_SELECT)
      .eq('tenant_id', tenantId)
      .lt('created_at', new Date(window.readStart).toISOString())
      .neq('status', 'cancelled')
      .not('customer_contact', 'is', null)
      .neq('customer_contact', '')
    if (window.outletId) query = query.eq('outlet_id', window.outletId)
    // `id` breaks created_at ties: pages are read concurrently as separate
    // queries, and imported histories share timestamps — without a total
    // order a row can land on two pages or on none.
    return query.order('created_at', { ascending: false }).order('id').range(from, to)
  })

  if (result.error) {
    return { visits: [], note: `Earlier customer history could not be read, so some regulars may show as first-timers (${result.error}).` }
  }
  const visits = result.rows.flatMap((row) => {
    const sale = toSale({ ...row, id: '', order_type: null, outlet_id: null })
    return sale.phone && isCompletedSale(sale) ? [{ phone: sale.phone, at: sale.at }] : []
  })
  return {
    visits,
    note: result.truncated ? 'Only the most recent customer history was read; some regulars may show as first-timers.' : null,
  }
}

const NO_PRIOR_VISITS = { visits: [] as CustomerVisit[], note: null }

function readOrders(client: SupabaseClient, tenantId: string, window: SalesReadWindow) {
  return readPages<OrderRow>((from, to) => {
    let query = client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(window.readStart).toISOString())
    if (window.outletId) query = query.eq('outlet_id', window.outletId)
    return query.order('created_at', { ascending: false }).order('id').range(from, to)
  })
}

export async function readSupabaseSales(
  client: SupabaseClient,
  tenantId: string,
  window: SalesReadWindow,
): Promise<SalesReadResult> {
  // The pre-window history does not depend on the window's orders: read both
  // at once rather than one after the other.
  const [orders, prior] = await Promise.all([
    readOrders(client, tenantId, window),
    window.includePriorVisits ? readPriorVisits(client, tenantId, window) : NO_PRIOR_VISITS,
  ])

  if (orders.error) {
    return { sales: [], priorVisits: [], notes: [`Orders could not be read: ${orders.error}`], failed: true }
  }

  const notes: string[] = []
  if (orders.truncated) notes.push('This store has more orders than one read can hold; older days are partial.')

  let sales = orders.rows.map(toSale)
  if (window.includeItems) {
    const wanted = new Set(
      sales.filter((sale) => sale.at >= window.currentStart && isCompletedSale(sale)).map((sale) => sale.id),
    )
    const items = await readItems(client, [...wanted])
    if (items.error) {
      notes.push(`Order items could not be read, so top items are unavailable (${items.error}).`)
    } else {
      sales = sales.map((sale) => (wanted.has(sale.id) ? { ...sale, items: items.byOrder.get(sale.id) ?? [] } : sale))
    }
  }

  if (prior.note) notes.push(prior.note)

  return { sales, priorVisits: prior.visits, notes, failed: false }
}
