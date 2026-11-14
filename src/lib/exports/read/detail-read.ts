/**
 * Reads the rows the detail sheets are built from, through the CALLER's
 * session client: row-level security decides which orders, payments, shifts
 * and customers come back. Never pass a service-role client.
 *
 * The platform API hands back at most 1000 rows per response and says nothing
 * about the rest, so every read here pages until a short page. Children are
 * read by `order_id IN (…)` in small groups (a long id list does not fit a
 * URL), a few groups at a time: every store shares this database.
 *
 * Over the order cap the read REFUSES; a file that silently stops at row
 * 20,000 would be believed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportBranchArgs } from '@/lib/reports/read/report-scope'
import { MAX_DETAIL_ORDERS } from '../catalogue'
import { ExportError } from '../errors'
import {
  DETAIL_CUSTOMER_COLUMNS,
  DETAIL_ITEM_COLUMNS,
  DETAIL_ORDER_COLUMNS,
  DETAIL_PAYMENT_COLUMNS,
  DETAIL_SHIFT_COLUMNS,
  type DetailCustomerRow,
  type DetailItemRow,
  type DetailOrderRow,
  type DetailPaymentRow,
  type DetailShiftRow,
} from '../sheets/detail-data'

/** The session client, narrowed to what these reads use. */
export type DetailClient = Pick<SupabaseClient, 'from'>

export const PAGE_SIZE = 1000
/** Order ids per child request: 100 uuids is ~3.7 KB of URL. */
export const CHILD_GROUP_SIZE = 100
const CHILD_CONCURRENCY = 4
/** A shift is hours long; one that opened this long before the period can still be open inside it. */
const SHIFT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000

export interface DetailWindow {
  tenantId: string
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  branch: ReportBranchArgs
  /** Rows asked for per request. Only tests change it (to page over a small fake); it must equal the API's row cap. */
  pageSize?: number
}

interface Page<Row> {
  data: Row[] | null
  error: { message: string } | null
}

/** Every row of a query, one page at a time. `page(from, to)` must order its rows the same way each call. */
async function readAll<Row>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Page<Row>>,
  { cap = Number.POSITIVE_INFINITY, pageSize = PAGE_SIZE }: { cap?: number; pageSize?: number } = {},
): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw new ExportError(`The ${what} could not be read. Try again in a moment.`, 502)
    const batch = data ?? []
    rows.push(...batch)
    if (rows.length > cap) return rows
    if (batch.length < pageSize) return rows
  }
}

function groupsOf<T>(values: readonly T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < values.length; i += size) groups.push(values.slice(i, i + size))
  return groups
}

/** Runs `task` over every input, at most `limit` at once, keeping input order. */
async function mapLimited<In, Out>(inputs: readonly In[], limit: number, task: (input: In) => Promise<Out>): Promise<Out[]> {
  const results: Out[] = new Array(inputs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < inputs.length) {
      const index = next
      next += 1
      results[index] = await task(inputs[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker))
  return results
}

function ordersQuery(client: DetailClient, window: DetailWindow, columns: string, options?: { count: 'exact'; head: true }) {
  let query = client
    .from('orders')
    .select(columns, options)
    .eq('tenant_id', window.tenantId)
    .gte('created_at', new Date(window.start).toISOString())
    .lt('created_at', new Date(window.end).toISOString())
  // The same branch rule as the report functions (reporting.order_figures).
  if (window.branch.p_outlet !== null) query = query.eq('outlet_id', window.branch.p_outlet)
  if (window.branch.p_unassigned) query = query.is('outlet_id', null)
  return query
}

/** How many orders the period holds for this caller, without reading them. */
export async function countOrders(client: DetailClient, window: DetailWindow): Promise<number> {
  const { count, error } = await ordersQuery(client, window, 'id', { count: 'exact', head: true })
  if (error || count === null) throw new ExportError('The orders could not be counted. Try again in a moment.', 502)
  return count
}

export function tooManyOrders(count: number): ExportError {
  return new ExportError(
    `That range has ${count.toLocaleString('en-US')} orders; one file can list ${MAX_DETAIL_ORDERS.toLocaleString('en-US')}. Pick a shorter range, or export the summary sheets only.`,
    413,
  )
}

/** The first few orders of the period, for the preview's peek. */
export async function readFirstOrders(client: DetailClient, window: DetailWindow, limit: number): Promise<DetailOrderRow[]> {
  const { data, error } = (await ordersQuery(client, window, DETAIL_ORDER_COLUMNS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(0, limit - 1)) as unknown as Page<DetailOrderRow>
  if (error) throw new ExportError('The orders could not be read. Try again in a moment.', 502)
  return data ?? []
}

export async function readOrders(client: DetailClient, window: DetailWindow): Promise<DetailOrderRow[]> {
  const rows = await readAll<DetailOrderRow>(
    'orders',
    (from, to) =>
      ordersQuery(client, window, DETAIL_ORDER_COLUMNS)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<Page<DetailOrderRow>>,
    { cap: MAX_DETAIL_ORDERS, pageSize: window.pageSize },
  )
  if (rows.length > MAX_DETAIL_ORDERS) throw tooManyOrders(rows.length)
  return rows
}

async function readChildren<Row extends { order_id: string }>(
  client: DetailClient,
  table: 'order_items' | 'order_payments',
  columns: string,
  what: string,
  orderIds: readonly string[],
  orderBy: string,
  pageSize?: number,
): Promise<Map<string, Row[]>> {
  const groups = await mapLimited(groupsOf(orderIds, CHILD_GROUP_SIZE), CHILD_CONCURRENCY, (ids) =>
    readAll<Row>(what, (from, to) =>
      client
        .from(table)
        .select(columns)
        .in('order_id', ids)
        .order(orderBy, { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<Page<Row>>,
      { pageSize },
    ),
  )
  const byOrder = new Map<string, Row[]>()
  for (const row of groups.flat()) {
    const list = byOrder.get(row.order_id)
    if (list) list.push(row)
    else byOrder.set(row.order_id, [row])
  }
  return byOrder
}

export function readItems(client: DetailClient, orderIds: readonly string[], pageSize?: number): Promise<Map<string, DetailItemRow[]>> {
  return readChildren<DetailItemRow>(client, 'order_items', DETAIL_ITEM_COLUMNS, 'order items', orderIds, 'order_id', pageSize)
}

export function readPayments(client: DetailClient, orderIds: readonly string[], pageSize?: number): Promise<Map<string, DetailPaymentRow[]>> {
  return readChildren<DetailPaymentRow>(client, 'order_payments', DETAIL_PAYMENT_COLUMNS, 'payments', orderIds, 'created_at', pageSize)
}

/**
 * Shifts that can hold an order of the period. Whoever may not read shifts
 * gets none back (RLS) and the Cashier / Shift columns stay blank: a failed
 * read is treated the same, because names are a courtesy, not a figure.
 */
export async function readShifts(client: DetailClient, window: DetailWindow): Promise<DetailShiftRow[]> {
  try {
    return await readAll<DetailShiftRow>('shifts', (from, to) =>
      client
        .from('staff_shifts')
        .select(DETAIL_SHIFT_COLUMNS)
        .eq('tenant_id', window.tenantId)
        .gte('opened_at', new Date(window.start - SHIFT_LOOKBACK_MS).toISOString())
        .lt('opened_at', new Date(window.end).toISOString())
        .order('opened_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<Page<DetailShiftRow>>,
    )
  } catch {
    return []
  }
}

export async function readCustomers(client: DetailClient, tenantId: string, customerIds: readonly string[]): Promise<Map<string, DetailCustomerRow>> {
  const groups = await mapLimited(groupsOf([...new Set(customerIds)], CHILD_GROUP_SIZE), CHILD_CONCURRENCY, (ids) =>
    readAll<DetailCustomerRow>('customers', (from, to) =>
      client
        .from('customers')
        .select(DETAIL_CUSTOMER_COLUMNS)
        .eq('tenant_id', tenantId)
        .in('id', ids)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<Page<DetailCustomerRow>>,
    ),
  )
  return new Map(groups.flat().map((row) => [row.id, row]))
}
