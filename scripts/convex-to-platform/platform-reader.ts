/**
 * Read-only view of the platform database for one store, through PostgREST
 * with the service role. Every list is paged past the 1000-row cap and every
 * query is bounded by the store id (indexed); nothing here writes.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  REKEY_TABLES,
  UNTOUCHED_KEYED_TABLES,
  type ConvexSnapshot,
  type PlatformState,
  type PlatformTenant,
  type RekeyTable,
  type UntouchedKeyedTable,
} from '@/lib/convex-import'

const PAGE = 1000
const CHUNK = 150
const REQUEST_TIMEOUT_MS = 20_000

export function platformClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  })
}

interface QueryResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Pages a query (which must be ordered by a unique key) until a short page. */
async function pageAll<T>(query: (from: number, to: number) => PromiseLike<QueryResult<T>>, label: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

function chunks<T>(values: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

export async function readTenant(db: SupabaseClient, slug: string): Promise<PlatformTenant> {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, order_backend, convex_deployment_url, loyalty_enabled, loyalty_shadow, timezone')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`tenants: ${error.message}`)
  if (!data) throw new Error(`No store with slug ${slug}`)
  const row = data as Record<string, unknown>
  return {
    id: String(row.id),
    slug: String(row.slug),
    orderBackend: (row.order_backend as string | null) ?? null,
    convexDeploymentUrl: (row.convex_deployment_url as string | null) ?? null,
    loyaltyEnabled: row.loyalty_enabled === true,
    loyaltyShadow: row.loyalty_shadow !== false,
    timezone: (row.timezone as string | null) ?? null,
  }
}

/** The deploy key, for `export` only. Never printed or written to disk by this tool. */
export async function readDeployKey(db: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await db.from('tenant_secrets').select('convex_deploy_key').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`tenant_secrets: ${error.message}`)
  const key = (data as { convex_deploy_key?: string | null } | null)?.convex_deploy_key
  if (!key) throw new Error('This store has no Convex deploy key in tenant_secrets')
  return key
}

async function idsWhereIn(
  db: SupabaseClient,
  table: string,
  column: string,
  tenantId: string,
  values: string[],
  extra: Record<string, string> = {}
): Promise<string[]> {
  const found: string[] = []
  for (const chunk of chunks(values)) {
    const rows = await pageAll<Record<string, string>>((from, to) => {
      let query = db.from(table).select(column).eq('tenant_id', tenantId).in(column, chunk)
      for (const [key, value] of Object.entries(extra)) query = query.eq(key, value)
      return query.order(column).range(from, to) as unknown as PromiseLike<QueryResult<Record<string, string>>>
    }, table)
    found.push(...rows.map((row) => String(row[column])))
  }
  return found
}

async function countWhereIn(db: SupabaseClient, table: string, column: string, tenantId: string, values: string[]): Promise<number> {
  let total = 0
  for (const chunk of chunks(values)) {
    const { count, error } = await db.from(table).select(column, { count: 'exact', head: true }).eq('tenant_id', tenantId).in(column, chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
    total += count ?? 0
  }
  return total
}

const UNTOUCHED_COLUMN: Record<UntouchedKeyedTable, string> = {
  order_status_events: 'external_order_id',
  inventory_audit_log: 'order_id',
  store_activity: 'external_order_id',
  voucher_redemptions: 'order_id',
  loyalty_ledger: 'external_order_id',
  gov_discount_claims: 'external_order_id',
  approval_requests: 'external_order_id',
}

export async function readPlatformState(db: SupabaseClient, slug: string, snapshot: ConvexSnapshot): Promise<PlatformState> {
  const tenant = await readTenant(db, slug)
  const t = tenant.id
  const convexIds = snapshot.orders.map((order) => order._id)

  const menuItemIds = await pageAll<{ id: string }>(
    (from, to) => db.from('menu_items').select('id').eq('tenant_id', t).order('id').range(from, to),
    'menu_items'
  )
  const ownTypes = await pageAll<{ id: string; tenant_id: string; name: string | null }>(
    (from, to) => db.from('order_types').select('id, tenant_id, name').eq('tenant_id', t).order('id').range(from, to),
    'order_types'
  )
  const referenced = [...new Set(snapshot.orders.map((o) => o.orderTypeId).filter((id): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id)))]
  const foreignTypes: Array<{ id: string; tenant_id: string; name: string | null }> = []
  for (const chunk of chunks(referenced)) {
    const { data, error } = await db.from('order_types').select('id, tenant_id, name').in('id', chunk)
    if (error) throw new Error(`order_types: ${error.message}`)
    foreignTypes.push(...((data ?? []) as typeof foreignTypes))
  }
  const typeById = new Map([...ownTypes, ...foreignTypes].map((type) => [type.id, type]))
  const paymentMethods = await pageAll<{ id: string; name: string }>(
    (from, to) => db.from('payment_methods').select('id, name').eq('tenant_id', t).order('id').range(from, to),
    'payment_methods'
  )
  const outlets = await pageAll<{ id: string }>(
    (from, to) => db.from('outlets').select('id').eq('tenant_id', t).order('id').range(from, to),
    'outlets'
  )
  const existing = await pageAll<{ id: string; client_order_id: string | null; order_date: string | null; daily_number: number | null; created_at: string }>(
    (from, to) =>
      db.from('orders').select('id, client_order_id, order_date, daily_number, created_at').eq('tenant_id', t).order('id').range(from, to),
    'orders'
  )
  const costs = await pageAll<{ menu_item_id: string }>(
    (from, to) => db.from('product_costs').select('menu_item_id').eq('tenant_id', t).order('menu_item_id').range(from, to),
    'product_costs'
  )

  const convexKeyed = {} as Record<RekeyTable, string[]>
  for (const table of REKEY_TABLES) convexKeyed[table] = await idsWhereIn(db, table, 'order_id', t, convexIds)
  const untouchedKeyed: Partial<Record<UntouchedKeyedTable, number>> = {}
  for (const table of UNTOUCHED_KEYED_TABLES) {
    try {
      untouchedKeyed[table] = await countWhereIn(db, table, UNTOUCHED_COLUMN[table], t, convexIds)
    } catch {
      untouchedKeyed[table] = -1 // unreadable: shown as -1 so nobody mistakes it for "none"
    }
  }
  const customerLinkedConvexIds = await idsWhereIn(db, 'customer_external_orders', 'external_order_id', t, convexIds, { backend: 'convex' })
  const activityPlacedConvexIds = await idsWhereIn(db, 'store_activity', 'external_order_id', t, convexIds, {
    kind: 'order.placed',
    backend: 'convex',
  })

  return {
    tenant,
    menuItemIds: menuItemIds.map((row) => row.id),
    orderTypes: [...typeById.values()].map((type) => ({ id: type.id, tenantId: type.tenant_id, name: type.name })),
    paymentMethods,
    outletIds: outlets.map((row) => row.id),
    existingOrders: existing.map((row) => ({
      id: row.id,
      clientOrderId: row.client_order_id,
      orderDate: row.order_date,
      dailyNumber: row.daily_number,
      createdAt: row.created_at,
    })),
    productCostMenuItemIds: costs.map((row) => row.menu_item_id),
    convexKeyed,
    untouchedKeyed,
    customerLinkedConvexIds,
    activityPlacedConvexIds,
  }
}
