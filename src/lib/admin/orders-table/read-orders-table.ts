/**
 * The platform read behind the web Orders table: one page of orders, the
 * per-status counts for the tabs, and the store's order types and branches
 * for the filter menus.
 *
 * Reads through the CALLER's session client, so RLS applies and a branch
 * account's rows are also narrowed in the query (`scopeOrdersQuery`). Every
 * filter runs in SQL: the page, its total and the tab counts all describe the
 * same set of orders.
 *
 * Cost (the database is shared by every store): the page read and the six
 * head-only counts ride `orders_tenant_status_created_idx` /
 * `orders_tenant_created_idx`; counts are skipped for "All time", where they
 * would count a store's whole history on every live refresh. Probed on the
 * platform before shipping (see the PR).
 */

import { verifyTenantPermission } from '@/lib/admin-service'
import { createClient } from '@/lib/supabase/server'
import { resolveBranchScope, type BranchScope } from '@/lib/outlets/branch-scope'
import { scopeOrdersQuery } from '@/lib/outlets/branch-scope-query'
import { OUTLET_FILTER_UNASSIGNED } from '@/lib/outlets/order-outlet-display'
import { readCutoffScheduleForDisplay } from '@/lib/business-day/read-schedule'
import type { OrderWithItems } from '@/lib/orders-service'
import {
  dateRangeWindow,
  ORDERS_PAGE_SIZE,
  parseOrderSearch,
  type OrdersTableFilters,
  type PaymentFilter,
  type TimeWindow,
} from './filters'
import { ORDER_STATUSES, type OrderStatus } from './status'

export type StatusCounts = Record<OrderStatus | 'all', number>

export interface OrderTypeOption {
  id: string
  name: string
  type: string | null
}

export interface OutletOption {
  id: string
  name: string
}

export interface OrdersTableData {
  orders: OrderWithItems[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  /** Null for "All time", and when a count read failed. */
  counts: StatusCounts | null
  orderTypes: OrderTypeOption[]
  /** Empty for a branch account (it reads only its own branch). */
  outlets: OutletOption[]
}

/** The query-builder surface this module uses, so tests can pass a fake. */
interface FilterQuery {
  eq(column: string, value: unknown): FilterQuery
  neq(column: string, value: unknown): FilterQuery
  in(column: string, values: readonly unknown[]): FilterQuery
  is(column: string, value: null): FilterQuery
  not(column: string, operator: string, value: unknown): FilterQuery
  gte(column: string, value: unknown): FilterQuery
  lt(column: string, value: unknown): FilterQuery
  or(filter: string): FilterQuery
  order(column: string, options: { ascending: boolean }): FilterQuery
  range(from: number, to: number): FilterQuery
  limit(count: number): FilterQuery
  then: PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>['then']
}

interface OrdersDb {
  from(table: string): { select(columns: string, options?: { count?: 'exact'; head?: boolean }): FilterQuery }
}

const OPEN_STATUSES: readonly OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']

/**
 * The search as one PostgREST `or` filter: name or phone contains the text,
 * or the daily number is exactly the number typed. Values are double-quoted
 * and `parseOrderSearch` has already removed every character that is syntax
 * inside a logic tree, so the text cannot widen the filter.
 */
export function searchOrFilter(raw: string): string | null {
  const { text, orderNumber } = parseOrderSearch(raw)
  const parts: string[] = []
  if (text) {
    parts.push(`customer_name.ilike."%${text}%"`)
    parts.push(`customer_contact.ilike."%${text}%"`)
  }
  if (orderNumber !== null) parts.push(`daily_number.eq.${orderNumber}`)
  return parts.length > 0 ? parts.join(',') : null
}

/**
 * The payment filters, as the same rules `paymentChipOf` draws the chips by.
 * "Has proof" is `payment_proof_uploaded_at`, which checkout stamps whenever
 * it stores a screenshot or a reference (`orders-service.ts`).
 */
function applyPaymentFilter(query: FilterQuery, payment: PaymentFilter): FilterQuery {
  switch (payment) {
    case 'all':
      return query
    case 'paid':
      return query.in('payment_status', ['paid', 'verified']).neq('status', 'cancelled')
    case 'proof':
      return query
        .in('payment_status', ['pending', 'failed'])
        .neq('status', 'cancelled')
        .not('payment_proof_uploaded_at', 'is', null)
    case 'unpaid':
      return query
        .in('payment_status', ['pending', 'failed'])
        .in('status', OPEN_STATUSES)
        .is('payment_proof_uploaded_at', null)
  }
}

interface ApplyArgs {
  tenantId: string
  scope: BranchScope
  filters: OrdersTableFilters
  window: TimeWindow | null
}

function applyFilters(query: FilterQuery, { tenantId, scope, filters, window }: ApplyArgs): FilterQuery {
  let next = scopeOrdersQuery(query.eq('tenant_id', tenantId), scope)
  if (window) next = next.gte('created_at', window.startIso).lt('created_at', window.endIso)
  if (filters.type) next = next.eq('order_type', filters.type)
  // A branch account is already narrowed to its own branch above; a branch in
  // the address cannot widen or move that.
  if (scope.kind === 'all' && filters.branch) {
    next = filters.branch === OUTLET_FILTER_UNASSIGNED ? next.is('outlet_id', null) : next.eq('outlet_id', filters.branch)
  }
  next = applyPaymentFilter(next, filters.payment)
  const search = searchOrFilter(filters.q)
  if (search) next = next.or(search)
  return next
}

export interface QueryOrdersTableArgs extends ApplyArgs {
  pageSize?: number
}

/** The reads themselves, separated from auth so tests can drive a fake client. */
export async function queryOrdersTable(
  db: OrdersDb,
  args: QueryOrdersTableArgs,
): Promise<Pick<OrdersTableData, 'orders' | 'totalCount' | 'page' | 'pageSize' | 'totalPages' | 'counts'>> {
  const pageSize = args.pageSize ?? ORDERS_PAGE_SIZE
  const { filters } = args
  const offset = (filters.page - 1) * pageSize

  let pageQuery = applyFilters(db.from('orders').select('*, order_items(*)', { count: 'exact' }), args)
  if (filters.status !== 'all') pageQuery = pageQuery.eq('status', filters.status)
  pageQuery = pageQuery.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1)

  const countReads = args.window
    ? ORDER_STATUSES.map((status) =>
        applyFilters(db.from('orders').select('id', { count: 'exact', head: true }), args).eq('status', status),
      )
    : []

  const [pageResult, ...countResults] = await Promise.all([pageQuery, ...countReads])
  if (pageResult.error) throw new Error(pageResult.error.message)

  const totalCount = pageResult.count ?? 0
  let counts: StatusCounts | null = null
  // A failed count must not take the page down with it: the tabs lose their
  // numbers, the orders still show.
  if (countResults.length > 0 && countResults.every((result) => !result.error && typeof result.count === 'number')) {
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((status, i) => [status, countResults[i].count as number]))
    counts = {
      ...(byStatus as Record<OrderStatus, number>),
      all: ORDER_STATUSES.reduce((sum, status) => sum + (byStatus[status] as number), 0),
    }
  }

  return {
    orders: (pageResult.data ?? []) as OrderWithItems[],
    totalCount,
    page: filters.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    counts,
  }
}

/** The page's read: auth, business day, orders, counts and the filter menus. */
export async function readOrdersTable(tenantId: string, filters: OrdersTableFilters): Promise<OrdersTableData> {
  const { userRole } = await verifyTenantPermission(tenantId, 'orders', 'view')
  const scope = resolveBranchScope(userRole)
  const supabase = await createClient()

  const schedule = filters.range === 'all' ? null : (await readCutoffScheduleForDisplay(supabase, tenantId)).schedule
  const window = schedule ? dateRangeWindow(filters.range, Date.now(), schedule) : null

  const typesRead = supabase.from('order_types').select('id, name, type').eq('tenant_id', tenantId).limit(100)
  const outletsRead =
    scope.kind === 'all'
      ? supabase.from('outlets').select('id, name').eq('tenant_id', tenantId).order('name', { ascending: true }).limit(200)
      : null

  const [table, typesResult, outletsResult] = await Promise.all([
    queryOrdersTable(supabase as unknown as OrdersDb, { tenantId, scope, filters, window }),
    typesRead,
    outletsRead,
  ])

  // The menus are conveniences: an unreadable list hides that filter only.
  const orderTypes = ((typesResult.data ?? []) as OrderTypeOption[]).filter((t) => typeof t.name === 'string' && t.name.trim() !== '')
  const outlets = ((outletsResult?.data ?? []) as OutletOption[]).filter((o) => typeof o.name === 'string')

  return { ...table, orderTypes, outlets }
}
