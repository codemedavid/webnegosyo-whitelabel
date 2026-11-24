/**
 * Sale records from the shared platform project's `orders` table.
 *
 * Two independent reads, run concurrently, both paged past PostgREST's
 * 1000-row cap (`paged-read.ts`):
 *  - every order from `readStart` on, guests included, for the reporting
 *    windows; line items only for the current window's completed sales;
 *  - before `readStart`, only identified completed visits, because the Growth
 *    classifier needs to know whether a phone has ever bought here before —
 *    skipped unless `includePriorVisits` (the Overview never uses them).
 *
 * Every sale carries its NET SALES (`sale-record.ts`), worked out by the one
 * sales model from the order's own total, fees and discount, and the read is
 * marked `net_sales`: the Overview then counts what the reports count. Best
 * sellers take each line's share of that net (`orderLineFigures`), so the
 * dishes add up to the order exactly as on /admin/reports/items.
 *
 * A failed read is reported in `notes`, never rendered as zero sales.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCustomerIdentity } from '@/lib/customer-identity'
import { fromCents } from '@/lib/reports/money'
import { orderFigures, orderLineFigures } from '@/lib/reports/sales-model'
import {
  NET_SALES_EXTRA_COLUMNS,
  REPORT_ITEM_COLUMNS,
  toNetSalesOrder,
  type NetSalesOrderRow,
  type PlatformOrderItemRow,
} from '@/lib/reports/read/platform-order-row'
import {
  countsTowardSales,
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

const ORDER_SELECT = `id, customer_contact, status, payment_status, source, order_type, outlet_id, total, created_at, ${NET_SALES_EXTRA_COLUMNS}`
const VISIT_SELECT = 'customer_contact, status, payment_status, source, total, created_at'

/** The columns every sale is built from; net sales needs the rest of `OrderRow`. */
interface BaseOrderRow {
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

type OrderRow = BaseOrderRow & NetSalesOrderRow

/** Page batches read at once once a history overflows its first page. */
const PAGE_CONCURRENCY = 4

function readPages<T>(page: PageReader<T>) {
  return readPagesConcurrently(page, { pageSize: PAGE_SIZE, maxRows: MAX_ROWS, concurrency: PAGE_CONCURRENCY })
}

function phoneOf(contact: string | null): string | null {
  return resolveCustomerIdentity({ contact }).phoneE164
}

function toBaseSale(row: BaseOrderRow): SaleRecord {
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

/** A sale with its net sales, from the one sales model. */
function toSale(row: OrderRow): SaleRecord {
  return { ...toBaseSale(row), net: fromCents(orderFigures(toNetSalesOrder(row)).netCents) }
}

/** The order's dishes, each worth its share of the order's net sales (as Reports › Items). */
function toItems(row: OrderRow, lines: readonly PlatformOrderItemRow[]): SaleItem[] {
  return orderLineFigures(toNetSalesOrder(row, lines))
    .filter((line) => !line.isUnrecorded)
    .map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      revenue: fromCents(line.netCents),
    }))
}

async function readItems(
  client: SupabaseClient,
  orderIds: string[],
): Promise<{ byOrder: Map<string, PlatformOrderItemRow[]>; error: string | null }> {
  const chunks: string[][] = []
  for (let i = 0; i < orderIds.length; i += ITEM_CHUNK) chunks.push(orderIds.slice(i, i + ITEM_CHUNK))

  const byOrder = new Map<string, PlatformOrderItemRow[]>()
  for (let i = 0; i < chunks.length; i += ITEM_CONCURRENCY) {
    const results = await Promise.all(
      chunks.slice(i, i + ITEM_CONCURRENCY).map((ids) =>
        readPages<PlatformOrderItemRow>((from, to) =>
          client.from('order_items').select(REPORT_ITEM_COLUMNS).in('order_id', ids).order('id').range(from, to),
        ),
      ),
    )
    const failed = results.find((result) => result.error)
    if (failed) return { byOrder: new Map(), error: failed.error }
    for (const row of results.flatMap((result) => result.rows)) {
      byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), row])
    }
  }
  return { byOrder, error: null }
}

async function readPriorVisits(
  client: SupabaseClient,
  tenantId: string,
  window: SalesReadWindow,
): Promise<{ visits: CustomerVisit[]; note: string | null }> {
  const result = await readPages<Omit<BaseOrderRow, 'id' | 'order_type' | 'outlet_id'>>((from, to) => {
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
    // Customer history keeps the completed-visit rule (Growth), whatever the money basis.
    const sale = toBaseSale({ ...row, id: '', order_type: null, outlet_id: null })
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
    if (window.readEnd !== undefined) query = query.lt('created_at', new Date(window.readEnd).toISOString())
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

  const rowsById = new Map(orders.rows.map((row) => [row.id, row]))
  let sales = orders.rows.map(toSale)
  if (window.includeItems) {
    const wanted = new Set(
      sales
        .filter((sale) => sale.at >= window.currentStart && countsTowardSales(sale, 'net_sales'))
        .map((sale) => sale.id),
    )
    const items = await readItems(client, [...wanted])
    if (items.error) {
      notes.push(`Order items could not be read, so top items are unavailable (${items.error}).`)
    } else {
      sales = sales.map((sale) => {
        const row = rowsById.get(sale.id)
        return wanted.has(sale.id) && row ? { ...sale, items: toItems(row, items.byOrder.get(sale.id) ?? []) } : sale
      })
    }
  }

  if (prior.note) notes.push(prior.note)

  return { sales, priorVisits: prior.visits, notes, failed: false, basis: 'net_sales' }
}
