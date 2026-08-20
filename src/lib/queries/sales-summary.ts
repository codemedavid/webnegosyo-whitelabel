/**
 * The MCP's "how is my store doing" read: order count, revenue, average order
 * value and a per-day series over a trailing window.
 *
 * Routing follows the same rule as `menu-performance.ts`: ask whichever
 * database the tenant's orders actually live in (decided by
 * `resolveOrderBackend`, the same function checkout uses to WRITE orders), and
 * never fall back to another database — silence is reported as silence via the
 * `coverage` field, not rendered as a dead restaurant.
 *
 * Days are bucketed by the merchant-local (Asia/Manila) calendar day so the
 * series matches what the tenant's own dashboards show; the Convex
 * `analytics:getTrends` query already buckets that way on its side.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { createConvexServerClient } from '@/lib/convex/server'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import {
  resolveOrderBackend,
  hasTenantSupabaseOrderCredentials,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'
import type { MenuPerformanceSource, MenuPerformanceCoverage } from '@/lib/queries/menu-performance-merge'

const DEFAULT_WINDOW_DAYS = 30
/** PostgREST caps a page at 1000; a full page means the tail is missing. */
const SUPABASE_ROW_LIMIT = 1000
const CONVEX_TRENDS_PATH = 'analytics:getTrends'
const MERCHANT_LOCAL_TIME_ZONE = 'Asia/Manila'

interface ConvexQueryClient {
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>
}

export interface DailySales {
  /** Merchant-local calendar day, YYYY-MM-DD. */
  date: string
  orders: number
  revenue: number
}

export interface SalesSummary {
  dataSource: MenuPerformanceSource
  windowDays: number
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  days: DailySales[]
  coverage: MenuPerformanceCoverage
}

export interface BuildSalesSummaryParams {
  dataSource: MenuPerformanceSource
  windowDays: number
  days: readonly DailySales[]
  /** Set when the backend capped the rows it returned. */
  truncated?: boolean
}

export interface FetchSalesSummaryOptions {
  windowDays?: number
  /** Service-role client for the shared platform project. */
  platformClient?: SupabaseClient
  convexFactory?: (url: string, key: string) => ConvexQueryClient
  tenantSupabaseFactory?: (tenant: OrderBackendTenantFields) => SupabaseClient
}

/** The tenant columns this read needs. Structural, so tests pass plain objects. */
export type SalesSummaryTenant = OrderBackendTenantFields & { id: string }

/** Coerces a possibly-string numeric (PostgREST `numeric`) to a finite number. */
function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Merchant-local calendar day of a timestamp, as YYYY-MM-DD. */
function localDateKey(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'unknown'
  return parsed.toLocaleDateString('en-CA', { timeZone: MERCHANT_LOCAL_TIME_ZONE })
}

/** Groups platform/tenant-Supabase order rows into merchant-local daily buckets. */
export function platformOrdersToDaily(rows: readonly unknown[]): DailySales[] {
  const byDay = new Map<string, { orders: number; revenue: number }>()
  for (const raw of rows) {
    const row = raw as { created_at?: unknown; total?: unknown }
    if (typeof row?.created_at !== 'string') continue
    const key = localDateKey(row.created_at)
    const bucket = byDay.get(key) ?? { orders: 0, revenue: 0 }
    byDay.set(key, { orders: bucket.orders + 1, revenue: bucket.revenue + toNumber(row.total) })
  }
  return [...byDay.entries()]
    .map(([date, b]) => ({ date, orders: b.orders, revenue: b.revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Normalizes Convex `analytics:getTrends` rows (already daily) into buckets. */
export function convexTrendsToDaily(rows: readonly unknown[]): DailySales[] {
  return rows
    .map((raw) => {
      const row = raw as { date?: unknown; totalOrders?: unknown; totalRevenue?: unknown }
      return {
        date: typeof row?.date === 'string' ? row.date : 'unknown',
        orders: toNumber(row?.totalOrders),
        revenue: toNumber(row?.totalRevenue),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Pure totals over normalized daily buckets. Coverage explains empty/partial reads. */
export function buildSalesSummary(params: BuildSalesSummaryParams): SalesSummary {
  const { dataSource, windowDays, days, truncated = false } = params
  const totalOrders = days.reduce((sum, d) => sum + d.orders, 0)
  const totalRevenue = days.reduce((sum, d) => sum + d.revenue, 0)

  let coverage: MenuPerformanceCoverage
  if (truncated) {
    coverage = {
      complete: false,
      note: 'The backend returned a full page, so this window is PARTIAL (truncated) — totals are a floor, not the real figure.',
    }
  } else if (totalOrders === 0) {
    coverage = {
      complete: false,
      note: 'The read returned no order data for this window. That is an absence of evidence, not proof the store sold nothing.',
    }
  } else {
    coverage = { complete: true }
  }

  return {
    dataSource,
    windowDays,
    totalOrders,
    totalRevenue,
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    days: [...days],
    coverage,
  }
}

/** An empty result that explains itself instead of looking like zero sales. */
function unavailable(dataSource: MenuPerformanceSource, windowDays: number, note: string): SalesSummary {
  return {
    dataSource,
    windowDays,
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    days: [],
    coverage: { complete: false, note },
  }
}

async function fetchFromSupabase(
  client: SupabaseClient,
  tenantId: string,
  windowDays: number,
  dataSource: MenuPerformanceSource,
): Promise<SalesSummary> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('orders')
    .select('created_at, total')
    .eq('tenant_id', tenantId)
    .gte('created_at', windowStart)
    .neq('status', 'cancelled')
    .limit(SUPABASE_ROW_LIMIT)

  if (error) {
    return unavailable(dataSource, windowDays, `Order database could not be reached: ${error.message}`)
  }

  const rows = (data ?? []) as unknown[]
  return buildSalesSummary({
    dataSource,
    windowDays,
    days: platformOrdersToDaily(rows),
    truncated: rows.length >= SUPABASE_ROW_LIMIT,
  })
}

async function fetchFromConvex(
  tenant: SalesSummaryTenant,
  windowDays: number,
  factory: (url: string, key: string) => ConvexQueryClient,
): Promise<SalesSummary> {
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
    const rows = await factory(url, key).query<unknown[]>(CONVEX_TRENDS_PATH, { daysBack: windowDays })
    return buildSalesSummary({
      dataSource: 'convex',
      windowDays,
      days: convexTrendsToDaily(Array.isArray(rows) ? rows : []),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return unavailable('convex', windowDays, `Convex deployment could not be reached: ${message}`)
  }
}

/**
 * Order count / revenue / AOV / daily series for a tenant over the trailing
 * `windowDays`, read from that tenant's actual order backend.
 */
export async function fetchSalesSummary(
  tenant: SalesSummaryTenant,
  options: FetchSalesSummaryOptions = {},
): Promise<SalesSummary> {
  const {
    windowDays = DEFAULT_WINDOW_DAYS,
    platformClient,
    convexFactory = createConvexServerClient,
    tenantSupabaseFactory = (t: OrderBackendTenantFields) => createTenantOrderWriteClient(t),
  } = options

  const backend = resolveOrderBackend(tenant)

  if (backend === 'convex') {
    return fetchFromConvex(tenant, windowDays, convexFactory)
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

/** Tenant columns needed to decide where the orders are and how to reach them. */
const TENANT_ROUTING_SELECT =
  'id, order_backend, convex_deployment_url, convex_deploy_key, ' +
  'supabase_order_url, supabase_order_anon_key, supabase_order_service_key'

/**
 * Resolve a tenant by id through the service-role provisioning client, then
 * summarize its sales. A missing tenant THROWS rather than returning an empty
 * summary: rendering a caller mistake as "this store sold nothing" invites the
 * model to act on a restaurant that isn't there.
 */
export async function fetchSalesSummaryForTenantId(
  tenantId: string,
  ctx: ProvisioningCtx,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<SalesSummary> {
  const { data, error } = await ctx.client
    .from('tenants')
    .select(TENANT_ROUTING_SELECT)
    .eq('id', tenantId)
    .single()

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} could not be loaded: ${error?.message ?? 'not found'}`)
  }

  return fetchSalesSummary({ ...(data as unknown as SalesSummaryTenant), id: tenantId }, {
    windowDays,
    platformClient: ctx.client as unknown as SupabaseClient,
  })
}
