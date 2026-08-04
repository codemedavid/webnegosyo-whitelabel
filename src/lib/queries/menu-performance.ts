/**
 * I/O shell for the MCP's menu-performance read: ask the same "what sold, and
 * how much" question of whichever database a tenant's orders actually live in.
 *
 * Routing is decided by `resolveOrderBackend`, the same function checkout uses
 * to decide where to WRITE an order — so this read can never drift to a
 * different database than the one the tenant is filling.
 *
 * A backend that cannot be reached returns an EMPTY result carrying a coverage
 * note that says so. It never falls back to another database: answering from
 * the wrong project, authoritatively, is how the superadmin dashboard came to
 * report zeros for every Convex-backed restaurant. Silence is reported as
 * silence.
 *
 * All arithmetic lives in the pure `menu-performance-merge.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createConvexServerClient } from '@/lib/convex/server'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import {
  resolveOrderBackend,
  hasTenantSupabaseOrderCredentials,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'
import {
  buildMenuPerformance,
  convexTopItemsToRows,
  platformOrderItemsToRows,
  type MenuPerformance,
  type MenuPerformanceSource,
} from '@/lib/queries/menu-performance-merge'

/** Rows are selected through the join because `order_items` has no tenant_id. */
const ORDER_ITEMS_SELECT = 'menu_item_id, menu_item_name, quantity, subtotal, orders!inner(tenant_id, created_at, status)'

const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_CONVEX_LIMIT = 500
/** PostgREST caps a page at 1000; a full page means the tail is missing. */
const SUPABASE_ROW_LIMIT = 1000
const CONVEX_TOP_ITEMS_PATH = 'analytics:getTopItems'

interface ConvexQueryClient {
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>
}

export interface FetchMenuPerformanceOptions {
  windowDays?: number
  convexLimit?: number
  /** Service-role client for the shared platform project. */
  platformClient?: SupabaseClient
  convexFactory?: (url: string, key: string) => ConvexQueryClient
  tenantSupabaseFactory?: (tenant: OrderBackendTenantFields) => SupabaseClient
}

/** The tenant columns this read needs. Structural, so tests pass plain objects. */
export type MenuPerformanceTenant = OrderBackendTenantFields & { id: string }

/** An empty result that explains itself instead of looking like zero sales. */
function unavailable(dataSource: MenuPerformanceSource, windowDays: number, note: string): MenuPerformance {
  return {
    dataSource,
    windowDays,
    totalUnits: 0,
    totalRevenue: 0,
    items: [],
    coverage: { complete: false, note },
  }
}

function windowStartISO(windowDays: number): string {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
}

/** Per-item totals from a Supabase project (platform or the tenant's own). */
async function fetchFromSupabase(
  client: SupabaseClient,
  tenantId: string,
  windowDays: number,
  dataSource: MenuPerformanceSource,
): Promise<MenuPerformance> {
  const { data, error } = await client
    .from('order_items')
    .select(ORDER_ITEMS_SELECT)
    .eq('orders.tenant_id', tenantId)
    .gte('orders.created_at', windowStartISO(windowDays))
    .neq('orders.status', 'cancelled')
    .limit(SUPABASE_ROW_LIMIT)

  if (error) {
    return unavailable(dataSource, windowDays, `Order database could not be reached: ${error.message}`)
  }

  const rows = (data ?? []) as unknown[]
  return buildMenuPerformance({
    dataSource,
    windowDays,
    rows: platformOrderItemsToRows(rows),
    truncated: rows.length >= SUPABASE_ROW_LIMIT,
  })
}

/** Per-item totals from a tenant's own Convex deployment. */
async function fetchFromConvex(
  tenant: MenuPerformanceTenant,
  windowDays: number,
  convexLimit: number,
  factory: (url: string, key: string) => ConvexQueryClient,
): Promise<MenuPerformance> {
  const url = tenant.convex_deployment_url?.trim()
  const key = tenant.convex_deploy_key?.trim()

  if (!url || !key) {
    return unavailable(
      'convex',
      windowDays,
      'Tenant is on the Convex order backend but its credentials are missing or misconfigured, so its sales cannot be read. Not falling back to the platform database — that would answer from the wrong project.',
    )
  }

  try {
    // `analytics:getTopItems` is already deployed to every tenant, and it takes
    // a limit — so a menu-wide read needs no Convex redeploy.
    const items = await factory(url, key).query<unknown[]>(CONVEX_TOP_ITEMS_PATH, {
      daysBack: windowDays,
      limit: convexLimit,
    })
    const rows = Array.isArray(items) ? items : []

    return buildMenuPerformance({
      dataSource: 'convex',
      windowDays,
      rows: convexTopItemsToRows(rows),
      truncated: rows.length >= convexLimit,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return unavailable('convex', windowDays, `Convex deployment could not be reached: ${message}`)
  }
}

/**
 * Per-item sales for a tenant over the trailing `windowDays`, read from that
 * tenant's actual order backend and labelled with which one answered.
 */
export async function fetchMenuPerformance(
  tenant: MenuPerformanceTenant,
  options: FetchMenuPerformanceOptions = {},
): Promise<MenuPerformance> {
  const {
    windowDays = DEFAULT_WINDOW_DAYS,
    convexLimit = DEFAULT_CONVEX_LIMIT,
    platformClient,
    convexFactory = createConvexServerClient,
    tenantSupabaseFactory = (t: OrderBackendTenantFields) => createTenantOrderWriteClient(t),
  } = options

  const backend = resolveOrderBackend(tenant)

  if (backend === 'convex') {
    return fetchFromConvex(tenant, windowDays, convexLimit, convexFactory)
  }

  if (backend === 'supabase') {
    if (!hasTenantSupabaseOrderCredentials(tenant)) {
      return unavailable(
        'tenant_supabase',
        windowDays,
        'Tenant is on its own Supabase order project but its credentials are missing or misconfigured, so its sales cannot be read.',
      )
    }
    return fetchFromSupabase(tenantSupabaseFactory(tenant), tenant.id, windowDays, 'tenant_supabase')
  }

  if (!platformClient) {
    return unavailable('platform', windowDays, 'No platform database client was provided for this read.')
  }
  return fetchFromSupabase(platformClient, tenant.id, windowDays, 'platform')
}
