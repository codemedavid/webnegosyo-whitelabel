/**
 * The reconcile's database side (`missing-from-book.ts`) — service role, every
 * query scoped to the tenant the caller was verified for.
 *
 * Bounded like every report read: the window on `(tenant_id, created_at)`
 * (indexed), only orders with a discount (`discount_total > 0`), paged past the
 * 1000-row API cap and capped; ledger lookups in chunks.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPagesConcurrently, type PageResponse } from '@/lib/dashboard/paged-read'
import { readOrderDiscount } from '@/lib/order-discount'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import type { BookOrder, MissingStore } from './missing-from-book'

type Db = SupabaseClient<Database>
type Row = Record<string, unknown>

/** Orders carry their items, so pages are smaller than the 1000-row cap. */
const ORDER_PAGE_SIZE = 200
const MAX_ORDERS = 2_000
const CONCURRENCY = 3
const ID_CHUNK = 200

const ORDER_COLUMNS = [
  'id',
  'created_at',
  'status',
  'outlet_id',
  'daily_number',
  'total',
  'service_charge_amount',
  'delivery_fee',
  'source',
  'revision_number',
  'discount_data',
  'customer_discount:customer_data->discount',
  'order_items(menu_item_id, menu_item_name, quantity, subtotal)',
].join(', ')

function fail(context: string, message: string): never {
  throw new Error(`[gov-discount-missing] ${context}: ${message}`)
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toBookOrder(row: Row): BookOrder {
  const discount = readOrderDiscount({ discount_data: row.discount_data, customer_data: { discount: row.customer_discount } })
  const items = Array.isArray(row.order_items) ? (row.order_items as Row[]) : []
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    status: String(row.status ?? ''),
    outletId: typeof row.outlet_id === 'string' ? row.outlet_id : null,
    dailyNumber: row.daily_number === null || row.daily_number === undefined ? null : num(row.daily_number),
    total: num(row.total),
    serviceCharge: num(row.service_charge_amount),
    deliveryFee: num(row.delivery_fee),
    source: row.source === 'pos' ? 'pos' : 'online',
    revision: Math.trunc(num(row.revision_number)),
    government: discount?.government ?? null,
    items: items.map((item) => ({
      menuItemId: typeof item.menu_item_id === 'string' ? item.menu_item_id : null,
      name: typeof item.menu_item_name === 'string' ? item.menu_item_name : 'Item',
      quantity: Math.trunc(num(item.quantity)),
      subtotal: num(item.subtotal),
    })),
  }
}

const asPage = (response: { data: unknown; error: { message: string } | null }): PageResponse<Row> => ({
  data: (response.data as Row[] | null) ?? null,
  error: response.error,
})

/** Whether the store's orders live on the platform (the only backend we read). */
export async function isPlatformStore(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from('tenants')
    .select('order_backend, convex_deployment_url')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) fail('tenant backend', error.message)
  return data !== null && resolveOrderBackend(data as OrderBackendTenantFields) === 'platform'
}

/** One stored order of this store, for "Record now". */
export async function loadBookOrder(db: Db, tenantId: string, orderId: string): Promise<BookOrder | null> {
  const { data, error } = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .maybeSingle()
  if (error) fail('order', error.message)
  return data ? toBookOrder(data as unknown as Row) : null
}

export function createSupabaseMissingStore(db: Db): MissingStore {
  return {
    async listDiscountedOrders(tenantId, startIso, endIso) {
      const result = await readPagesConcurrently<Row>(
        (from, to) =>
          db
            .from('orders')
            .select(ORDER_COLUMNS)
            .eq('tenant_id', tenantId)
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .gt('discount_total', 0)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
            .then(asPage),
        { pageSize: ORDER_PAGE_SIZE, maxRows: MAX_ORDERS, concurrency: CONCURRENCY },
      )
      if (result.error) fail('discounted orders', result.error)
      return result.rows.map(toBookOrder)
    },

    async recordedOrderIds(tenantId, orderIds) {
      const recorded = new Set<string>()
      for (let start = 0; start < orderIds.length; start += ID_CHUNK) {
        const chunk = orderIds.slice(start, start + ID_CHUNK)
        const { data, error } = await db
          .from('gov_discount_claims')
          .select('external_order_id')
          .eq('tenant_id', tenantId)
          .eq('backend', 'platform_supabase')
          .eq('event', 'granted')
          .in('external_order_id', chunk)
          .limit(chunk.length * 20)
        if (error) fail('recorded orders', error.message)
        for (const row of data ?? []) recorded.add(row.external_order_id)
      }
      return recorded
    },
  }
}
