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

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 500
/** Bound a request's memory; disclose partial history for larger stores. */
const ROW_LIMIT = 100_000

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

/** Orders and their line items from the platform database. */
async function fetchPlatformFacts(
  client: SupabaseClient,
  tenantId: string,
  options: Required<Pick<FetchCustomerOrderFactsOptions, 'days' | 'now'>> & { outletId?: string | null; includeLifetime?: boolean },
): Promise<CustomerFactsResult> {
  let query = client
    .from('orders')
    .select(ORDERS_SELECT)
    .eq('tenant_id', tenantId)

  if (!options.includeLifetime) query = query.gte('created_at', windowStartISO(options.days, options.now))

  if (options.outletId) query = query.eq('outlet_id', options.outletId)

  query = query.order('created_at', { ascending: false }).order('id')
  const { data, error } = await readPages((from, to) => query.range(from, to))

  if (error) {
    return unavailable(`Order database could not be reached: ${error.message}`)
  }

  const orders = (data ?? []) as unknown as PlatformOrderFactRow[]
  if (orders.length === 0) {
    return { facts: [], coverage: { complete: true } }
  }

  // `order_items` carries no tenant_id, so it is fetched by order id rather than
  // through a join — the ids above are already tenant-scoped.
  const itemRows: Array<PlatformOrderItemFactRow & { order_id: string }> = []
  let itemsError: { message: string } | null = null
  let itemsTruncated = false
  // Chunk IDs to stay within URL limits, then paginate the items too.
  for (let offset = 0; offset < orders.length; offset += 100) {
    const result = await readPages((from, to) => client
      .from('order_items')
      .select(ORDER_ITEMS_SELECT)
      .in('order_id', orders.slice(offset, offset + 100).map((order) => order.id))
      .order('id').range(from, to))
    if (result.error) { itemsError = result.error; break }
    itemsTruncated ||= result.data.length >= ROW_LIMIT
    itemRows.push(...result.data as unknown as typeof itemRows)
  }

  if (itemsError) {
    // Totals and visit dates are still true without line items; only the
    // favourite-item ranking degrades, so say so rather than losing the window.
    return {
      facts: orders.map((order) => platformOrderToFact(order, [])),
      coverage: {
        complete: false,
        note: `Order items could not be read, so favourite items are unavailable: ${itemsError.message}`,
      },
    }
  }

  const itemsByOrder = new Map<string, PlatformOrderItemFactRow[]>()
  for (const row of (itemRows ?? []) as Array<PlatformOrderItemFactRow & { order_id: string }>) {
    const bucket = itemsByOrder.get(row.order_id) ?? []
    bucket.push(row)
    itemsByOrder.set(row.order_id, bucket)
  }

  return {
    facts: orders.map((order) => platformOrderToFact(order, itemsByOrder.get(order.id) ?? [])),
    coverage: itemsTruncated
      ? { complete: false, note: 'Some order items exceeded the reading limit; favourite items may be incomplete.' }
      : truncationNote(orders.length),
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
