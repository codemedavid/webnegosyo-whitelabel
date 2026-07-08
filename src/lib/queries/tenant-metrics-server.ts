import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getFeatureAdoption, loadTenantDirectory } from '@/lib/queries/platform-analytics-server'
import { fetchConvexAggregates } from '@/lib/queries/convex-platform-aggregator'
import { rangeToWindows, type TenantWindowAggregate } from '@/lib/queries/platform-analytics-merge'

/**
 * Per-tenant order metrics for the superadmin tenant-management surfaces.
 *
 * Orders live in EITHER a tenant's Convex deployment OR the Supabase `orders`
 * table, so — like the platform analytics — we split tenants by backend: Supabase
 * tenants are scanned from `orders`, Convex tenants are fanned out to their
 * deployments and merged. Convex-backed tenants are excluded from the Supabase
 * scan to avoid double-counting any legacy rows.
 */

const PAGE = 1000
const MAX_ROWS = 50000 // safety cap

export interface TenantMetrics {
  tenantId: string
  orders30d: number
  ordersLifetime: number
  gmvLifetime: number
  lastOrderAt: string | null
}

export interface TenantsOverview {
  total: number
  active: number
  inactive: number
  app: number
  menuEngineering: number
  bundles: number
  lalamove: number
  orders30d: number
  gmv30d: number
}

interface MetricsOrderRow {
  tenant_id: string
  total: number | null
  created_at: string
}

/** Latest daily-bucket date in an aggregate, as an ISO timestamp, or null. */
function lastOrderFromAggregate(agg: TenantWindowAggregate): string | null {
  const keys = Object.keys(agg.daily)
  if (!keys.length) return null
  const latest = keys.sort()[keys.length - 1]
  return `${latest}T00:00:00.000Z`
}

/**
 * Aggregate order metrics for the given tenant ids. Every requested id is present
 * in the returned record (zero-filled). Returns {} for an empty input.
 */
export const getTenantMetrics = cache(
  async (tenantIds: string[]): Promise<Record<string, TenantMetrics>> => {
    if (!tenantIds.length) return {}

    const result: Record<string, TenantMetrics> = {}
    for (const id of tenantIds) {
      result[id] = {
        tenantId: id,
        orders30d: 0,
        ordersLifetime: 0,
        gmvLifetime: 0,
        lastOrderAt: null,
      }
    }

    const { convexTargets, convexIds } = await loadTenantDirectory()
    const requestedConvex = convexTargets.filter((t) => result[t.tenantId])
    const supabaseIds = tenantIds.filter((id) => !convexIds.has(id))

    const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86400000).toISOString()

    // ── Supabase-backed tenants ──
    if (supabaseIds.length) {
      const supabase = await createClient()
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data, error } = await supabase
          .from('orders')
          .select('tenant_id, total, created_at')
          .in('tenant_id', supabaseIds)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) {
          console.error('[tenant-metrics] order fetch error:', error.message)
          break
        }
        const rows = (data as unknown as MetricsOrderRow[]) ?? []
        for (const r of rows) {
          const m = result[r.tenant_id]
          if (!m) continue
          m.ordersLifetime += 1
          m.gmvLifetime += Number(r.total) || 0
          if (r.created_at >= thirtyDaysAgoISO) m.orders30d += 1
          if (!m.lastOrderAt || r.created_at > m.lastOrderAt) m.lastOrderAt = r.created_at
        }
        if (rows.length < PAGE) break
      }
    }

    // ── Convex-backed tenants (lifetime + 30d fan-outs) ──
    if (requestedConvex.length) {
      const now = Date.now()
      const [lifetimeAggs, monthAggs] = await Promise.all([
        fetchConvexAggregates(requestedConvex, rangeToWindows('all', now)),
        fetchConvexAggregates(requestedConvex, rangeToWindows('30d', now)),
      ])
      const monthById = new Map(monthAggs.map((a) => [a.tenantId, a]))
      for (const life of lifetimeAggs) {
        const m = result[life.tenantId]
        if (!m) continue
        m.ordersLifetime = life.orders
        m.gmvLifetime = life.gmv
        m.orders30d = monthById.get(life.tenantId)?.orders ?? 0
        m.lastOrderAt = lastOrderFromAggregate(life)
      }
    }

    return result
  },
)

/**
 * Platform-wide tenant overview. Feature/active counts derive from the cached
 * feature-adoption query; recent order volume combines a Supabase 30-day scan
 * (Supabase-only tenants) with a Convex 30-day fan-out (Convex-backed tenants).
 */
export const getTenantsOverview = cache(async (): Promise<TenantsOverview> => {
  const fa = await getFeatureAdoption()
  const { convexTargets, convexIds } = await loadTenantDirectory()

  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86400000).toISOString()

  let orders30d = 0
  let gmv30d = 0

  // ── Supabase-backed tenants (skip Convex tenants to avoid double-counting) ──
  const supabase = await createClient()
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('tenant_id, total, created_at, status')
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[tenant-metrics] overview order fetch error:', error.message)
      break
    }
    const rows = (data as unknown as (MetricsOrderRow & { status: string | null })[]) ?? []
    for (const r of rows) {
      if (convexIds.has(r.tenant_id)) continue
      if (r.status === 'cancelled') continue
      orders30d += 1
      gmv30d += Number(r.total) || 0
    }
    if (rows.length < PAGE) break
  }

  // ── Convex-backed tenants (30d fan-out) ──
  if (convexTargets.length) {
    const convexAggs = await fetchConvexAggregates(convexTargets, rangeToWindows('30d', Date.now()))
    for (const a of convexAggs) {
      orders30d += a.orders
      gmv30d += a.gmv
    }
  }

  return {
    total: fa.total,
    active: fa.active,
    inactive: fa.total - fa.active,
    app: fa.app,
    menuEngineering: fa.menuEngineering,
    bundles: fa.bundles,
    lalamove: fa.lalamove,
    orders30d,
    gmv30d,
  }
})
