/**
 * I/O shell for the Customer Hub: ask "who ordered, when, and what" of whichever
 * database a tenant's orders and identities actually live in.
 *
 * Routing is decided by `resolveOrderBackend`, the same function checkout uses
 * to decide where to WRITE an order, so this read can never drift to a different
 * database than the one the tenant is filling.
 *
 * One asymmetry worth understanding. Unlike `menu-performance.ts`, this reader
 * never opens a tenant's own Convex or Supabase project. Customer IDENTITY is
 * resolved on the platform at capture time and recorded in
 * `customer_external_orders`; a foreign backend holds orders but has no notion
 * of which guest they belong to. So the ledger IS the projection for those
 * tenants, and the only routing decision is which platform table to read.
 *
 * A read that fails returns EMPTY plus a coverage note saying so. It never falls
 * back to another source: answering authoritatively from the wrong place is how
 * the superadmin dashboard came to report zeros for every Convex restaurant.
 *
 * All arithmetic lives in the pure `customer-order-facts.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ledgerRowToFact,
  platformOrderToFact,
  type CustomerOrderFact,
  type ExternalLedgerFactRow,
  type PlatformOrderFactRow,
  type PlatformOrderItemFactRow,
} from '@/lib/customer-order-facts'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { readPagesConcurrently } from '@/lib/dashboard/paged-read'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'

const DAY_MS = 24 * 60 * 60 * 1000
/** PostgREST's `max-rows` on the platform project; a larger page would end the read early. */
const PAGE_SIZE = 1000
/** Bound a request's memory; disclose partial history for larger stores. */
const ROW_LIMIT = 100_000
/**
 * The Reports tab reads a store's whole history, and the merchant app gives up
 * after 15 s. Read one page after another, a 10,000-order store took ~22 s
 * (2026-10-22), so pages and item chunks are read side by side.
 */
const ORDER_PAGE_CONCURRENCY = 6
/** 150 uuids keep the request URL well under the gateway's limit. */
const ITEM_ORDER_CHUNK_SIZE = 150
const ITEM_READ_CONCURRENCY = 8

const ORDERS_SELECT =
  'id, customer_id, customer_contact, status, payment_status, outlet_id, total, created_at, updated_at, source'
const ORDER_ITEMS_SELECT = 'order_id, menu_item_id, menu_item_name, quantity, price'
const LEDGER_SELECT =
  'backend, external_order_id, customer_id, source, status, payment_status, outlet_id, total, ordered_at, completed_at, updated_at, items'

/** Tenant columns needed to decide where this tenant's orders are. */
export type CustomerFactsTenant = OrderBackendTenantFields & { id: string }

export interface CustomerFactsCoverage {
  complete: boolean
  note?: string
}

export interface CustomerFactsResult {
  facts: CustomerOrderFact[]
  coverage: CustomerFactsCoverage
}

export interface FetchCustomerOrderFactsOptions {
  days: number
  /** Required for retention and cadence: a reporting window is not a history limit. */
  includeLifetime?: boolean
  /** Narrow to a single branch; omitted means the whole business. */
  outletId?: string | null
  /** Service-role client for the shared platform project. */
  platformClient?: SupabaseClient
  now?: Date
}

/** An empty result that explains itself instead of looking like "no customers". */
function unavailable(note: string): CustomerFactsResult {
  return { facts: [], coverage: { complete: false, note } }
}

function windowStartISO(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString()
}

function truncationNote(count: number): CustomerFactsCoverage {
  return count >= ROW_LIMIT
    ? {
        complete: false,
        note: `Only the most recent ${ROW_LIMIT} orders were read, so older orders in this window are not counted.`,
      }
    : { complete: true }
}

async function readPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = []
  for (let from = 0; from < ROW_LIMIT; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1)
    if (result.error) return { data: [], error: result.error }
    data.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < PAGE_SIZE) break
  }
  return { data, error: null }
}

type ItemRow = PlatformOrderItemFactRow & { order_id: string }

interface PlatformOrdersRead {
  orders: PlatformOrderFactRow[]
  error: string | null
  truncated: boolean
}

/**
 * Oldest first, so an order placed while the pages are being read lands AFTER
 * every page instead of shifting the rows under them: newest-first offsets let
 * one new order push a row into a page that was already read (counted twice)
 * or out of one that was not yet (lost). An order synced late with an old
 * timestamp can still shift a row, so ids are de-duplicated as a backstop.
 */
async function readPlatformOrders(
  client: SupabaseClient,
  tenantId: string,
  options: Required<Pick<FetchCustomerOrderFactsOptions, 'days' | 'now'>> & { outletId?: string | null; includeLifetime?: boolean },
): Promise<PlatformOrdersRead> {
  // A fresh builder per page: a builder's range is mutable, so pages read side
  // by side must not share one.
  const page = (from: number, to: number) => {
    let query = client.from('orders').select(ORDERS_SELECT).eq('tenant_id', tenantId)
    if (!options.includeLifetime) query = query.gte('created_at', windowStartISO(options.days, options.now))
    if (options.outletId) query = query.eq('outlet_id', options.outletId)
    return query.order('created_at', { ascending: true }).order('id').range(from, to)
  }
  const { rows, error, truncated } = await readPagesConcurrently<PlatformOrderFactRow>(
    page as never,
    { pageSize: PAGE_SIZE, maxRows: ROW_LIMIT, concurrency: ORDER_PAGE_CONCURRENCY },
  )
  const seen = new Set<string>()
  const unique = rows.filter((order) => !seen.has(order.id) && Boolean(seen.add(order.id)))
  return { orders: unique.reverse(), error, truncated }
}

/**
 * Line items by order id (`order_items` carries no tenant_id; the ids are
 * already tenant-scoped). Chunks share a few read lanes; once one fails, no
 * further chunk is started.
 */
async function readPlatformItems(
  client: SupabaseClient,
  orderIds: string[],
): Promise<{ rows: ItemRow[]; error: { message: string } | null; truncated: boolean }> {
  const chunks = Array.from(
    { length: Math.ceil(orderIds.length / ITEM_ORDER_CHUNK_SIZE) },
    (_, index) => orderIds.slice(index * ITEM_ORDER_CHUNK_SIZE, (index + 1) * ITEM_ORDER_CHUNK_SIZE),
  )
  let error: { message: string } | null = null
  const results = await mapWithConcurrency(chunks, ITEM_READ_CONCURRENCY, async (ids) => {
    if (error) return null
    const result = await readPages((from, to) => client
      .from('order_items')
      .select(ORDER_ITEMS_SELECT)
      .in('order_id', ids)
      .order('id').range(from, to))
    error ??= result.error
    return result
  })
  if (error) return { rows: [], error, truncated: false }
  const pages = results.flatMap((result) => (result ? [result.data as unknown as ItemRow[]] : []))
  return {
    rows: pages.flat(),
    error: null,
    truncated: pages.some((rows) => rows.length >= ROW_LIMIT),
  }
}

/** Orders and their line items from the platform database. */
async function fetchPlatformFacts(
  client: SupabaseClient,
  tenantId: string,
  options: Required<Pick<FetchCustomerOrderFactsOptions, 'days' | 'now'>> & { outletId?: string | null; includeLifetime?: boolean },
): Promise<CustomerFactsResult> {
  const { orders, error, truncated } = await readPlatformOrders(client, tenantId, options)

  if (error) {
    return unavailable(`Order database could not be reached: ${error}`)
  }
  if (orders.length === 0) {
    return { facts: [], coverage: { complete: true } }
  }

  const items = await readPlatformItems(client, orders.map((order) => order.id))

  if (items.error) {
    // Totals and visit dates are still true without line items; only the
    // favourite-item ranking degrades, so say so rather than losing the window.
    return {
      facts: orders.map((order) => platformOrderToFact(order, [])),
      coverage: {
        complete: false,
        note: `Order items could not be read, so favourite items are unavailable: ${items.error.message}`,
      },
    }
  }

  const itemsByOrder = new Map<string, PlatformOrderItemFactRow[]>()
  for (const row of items.rows) {
    itemsByOrder.set(row.order_id, [...(itemsByOrder.get(row.order_id) ?? []), row])
  }

  return {
    facts: orders.map((order) => platformOrderToFact(order, itemsByOrder.get(order.id) ?? [])),
    coverage: items.truncated
      ? { complete: false, note: 'Some order items exceeded the reading limit; favourite items may be incomplete.' }
      : truncated
        ? { complete: false, note: `Only the first ${ROW_LIMIT} orders were read, so the newest orders are not counted.` }
        : { complete: true },
  }
}

/** The platform-side ledger rows for a tenant whose orders live elsewhere. */
async function fetchLedgerFacts(
  client: SupabaseClient,
  tenantId: string,
  backend: 'convex' | 'tenant_supabase',
  options: Required<Pick<FetchCustomerOrderFactsOptions, 'days' | 'now'>> & { outletId?: string | null; includeLifetime?: boolean },
): Promise<CustomerFactsResult> {
  let query = client
    .from('customer_external_orders')
    .select(LEDGER_SELECT)
    .eq('tenant_id', tenantId)
    .eq('backend', backend)

  if (!options.includeLifetime) query = query.gte('ordered_at', windowStartISO(options.days, options.now))

  if (options.outletId) query = query.eq('outlet_id', options.outletId)

  query = query.order('ordered_at', { ascending: false }).order('external_order_id')
  const { data, error } = await readPages((from, to) => query.range(from, to))

  if (error) {
    return unavailable(`Customer ledger could not be reached: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as ExternalLedgerFactRow[]
  return {
    facts: rows.map((row) => ledgerRowToFact({ ...row, backend })),
    coverage: {
      complete: false,
      note: [truncationNote(rows.length).note,
        'External history contains identified customers only; anonymous-order coverage cannot be measured.']
        .filter(Boolean).join(' '),
    },
  }
}

/**
 * Customer order facts for a tenant over the trailing `days`, read from whichever
 * source holds that tenant's identified orders.
 */
export async function fetchCustomerOrderFacts(
  tenant: CustomerFactsTenant,
  options: FetchCustomerOrderFactsOptions,
): Promise<CustomerFactsResult> {
  const { platformClient, outletId = null, days, now = new Date() } = options

  if (!platformClient) {
    return unavailable('No platform database client was provided for this read.')
  }

  const backend = resolveOrderBackend(tenant)
  const window = { days, now, outletId, includeLifetime: options.includeLifetime }

  if (backend === 'convex') {
    return fetchLedgerFacts(platformClient, tenant.id, 'convex', window)
  }
  if (backend === 'supabase') {
    return fetchLedgerFacts(platformClient, tenant.id, 'tenant_supabase', window)
  }
  return fetchPlatformFacts(platformClient, tenant.id, window)
}
