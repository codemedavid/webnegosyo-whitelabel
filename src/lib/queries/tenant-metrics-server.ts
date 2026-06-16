import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getFeatureAdoption } from '@/lib/queries/platform-analytics-server'

/**
 * Per-tenant order metrics for the superadmin tenant-management surfaces.
 *
 * PostgREST caps a single select at 1000 rows, so we paginate (mirroring the
 * pattern in platform-analytics-server.ts). Aggregation happens in JS because
 * the per-tenant slices we need (30d / lifetime / GMV / last order) are cheap to
 * compute over the current order volume.
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

    const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86400000).toISOString()

    const supabase = await createClient()
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from('orders')
        .select('tenant_id, total, created_at')
        .in('tenant_id', tenantIds)
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

    return result
  },
)

/**
 * Platform-wide tenant overview. Feature/active counts derive from the cached
 * feature-adoption query; recent order volume is computed from a paginated
 * 30-day order scan.
 */
export const getTenantsOverview = cache(async (): Promise<TenantsOverview> => {
  const fa = await getFeatureAdoption()

  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86400000).toISOString()
  const supabase = await createClient()

  let orders30d = 0
  let gmv30d = 0
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[tenant-metrics] overview order fetch error:', error.message)
      break
    }
    const rows = (data as unknown as { total: number | null; created_at: string }[]) ?? []
    for (const r of rows) {
      orders30d += 1
      gmv30d += Number(r.total) || 0
    }
    if (rows.length < PAGE) break
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
