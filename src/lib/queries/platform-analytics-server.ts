import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  rangeToWindows,
  rowsToTenantAggregates,
  buildPlatformAnalytics,
  type AnalyticsRange,
  type OrderRow,
  type PlatformAnalytics,
  type TenantMeta,
  type TenantWindowAggregate,
} from '@/lib/queries/platform-analytics-merge'
import { fetchConvexAggregates, type ConvexTenantTarget } from '@/lib/queries/convex-platform-aggregator'

/**
 * Platform-wide analytics for the superadmin dashboard.
 *
 * The platform is MULTI-BACKEND: a tenant's live orders live in EITHER its own
 * Convex deployment (when `convex_deployment_url` + `convex_deploy_key` are set)
 * OR the shared Supabase `orders` table. Reading only Supabase — as this module
 * used to — makes every Convex-backed (i.e. actually-active) restaurant invisible
 * and the platform numbers look empty. We now:
 *   1. list all tenants (service role) and split them into Convex vs Supabase,
 *   2. aggregate Supabase orders for the Supabase-only tenants,
 *   3. fan out to each Convex deployment for the rest,
 *   4. merge both into one platform view (see platform-analytics-merge.ts).
 *
 * Aggregation/merge logic is pure and unit-tested in platform-analytics-merge.ts;
 * this module is the I/O shell.
 */

// Re-export the shared types so existing importers keep their import paths.
export type {
  AnalyticsRange,
  PlatformAnalytics,
  RangeKpis,
  TimeBucket,
  CategorySlice,
  TopTenant,
} from '@/lib/queries/platform-analytics-merge'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // PH has no DST
const PAGE = 1000
const MAX_ROWS = 50000 // safety cap
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── tenant directory (service role: reads deploy keys, bypasses RLS) ──────────

export interface TenantDirectory {
  meta: Record<string, TenantMeta>
  convexTargets: ConvexTenantTarget[]
  convexIds: Set<string>
}

interface TenantDirRow {
  id: string
  name: string | null
  slug: string | null
  is_active: boolean | null
  convex_deployment_url: string | null
  convex_deploy_key: string | null
}

export const loadTenantDirectory = cache(async (): Promise<TenantDirectory> => {
  const admin = createAdminClient()
  const meta: Record<string, TenantMeta> = {}
  const convexTargets: ConvexTenantTarget[] = []
  const convexIds = new Set<string>()

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, slug, is_active, convex_deployment_url, convex_deploy_key')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[platform-analytics] tenant directory error:', error.message)
      break
    }
    const rows = (data as unknown as TenantDirRow[]) ?? []
    for (const r of rows) {
      meta[r.id] = {
        name: r.name ?? 'Unknown',
        slug: r.slug ?? '',
        isActive: r.is_active ?? false,
      }
      const url = r.convex_deployment_url?.trim()
      const key = r.convex_deploy_key?.trim()
      if (url && key) {
        convexTargets.push({ tenantId: r.id, url, key })
        convexIds.add(r.id)
      }
    }
    if (rows.length < PAGE) break
  }

  return { meta, convexTargets, convexIds }
})

// ── Supabase order fetch (paginated past PostgREST's 1000-row cap) ────────────

const fetchOrdersSince = cache(async (startISO: string | null): Promise<OrderRow[]> => {
  const supabase = await createClient()
  const cols = 'created_at, total, status, order_type, payment_method_name, tenant_id'
  const rows: OrderRow[] = []

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = supabase.from('orders').select(cols).order('created_at', { ascending: true }).range(from, from + PAGE - 1)
    if (startISO) q = q.gte('created_at', startISO)
    const { data, error } = await q
    if (error) {
      console.error('[platform-analytics] order fetch error:', error.message)
      break
    }
    const batch = (data as unknown as OrderRow[]) ?? []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
})

// ── main aggregate ────────────────────────────────────────────────────────────

export const getPlatformAnalytics = cache(async (range: AnalyticsRange): Promise<PlatformAnalytics> => {
  const now = Date.now()
  const windows = rangeToWindows(range, now)

  const { meta, convexTargets, convexIds } = await loadTenantDirectory()

  // Fetch far enough back to cover the previous window (for deltas).
  const earliestMs = windows.prevStartMs ?? windows.startMs
  const startISO = earliestMs != null ? new Date(earliestMs).toISOString() : null

  const [supabaseRows, convexAggs] = await Promise.all([
    fetchOrdersSince(startISO),
    fetchConvexAggregates(convexTargets, windows, { needBreakdown: true }),
  ])

  const supabaseAggs = rowsToTenantAggregates(supabaseRows, windows, convexIds)
  const allAggs: TenantWindowAggregate[] = [...supabaseAggs, ...convexAggs]

  return buildPlatformAnalytics(range, allAggs, meta)
})

// ── platform growth & adoption (tenant-derived, range-independent) ──────────

export interface GrowthBucket {
  label: string
  newTenants: number
  cumulative: number
}

export interface FeatureAdoption {
  total: number
  active: number
  menuEngineering: number
  bundles: number
  app: number
  lalamove: number
}

function monthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 7) // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`
}

export const getTenantGrowth = cache(async (): Promise<GrowthBucket[]> => {
  const supabase = await createClient()
  const buckets: GrowthBucket[] = []
  const map = new Map<string, number>()

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from('tenants')
      .select('created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data as unknown as { created_at: string }[]) ?? []
    for (const r of rows) {
      if (!r.created_at) continue
      const k = monthKey(r.created_at)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    if (rows.length < PAGE) break
  }

  let cumulative = 0
  for (const key of [...map.keys()].sort()) {
    cumulative += map.get(key) ?? 0
    buckets.push({ label: monthLabel(key), newTenants: map.get(key) ?? 0, cumulative })
  }
  return buckets
})

export const getFeatureAdoption = cache(async (): Promise<FeatureAdoption> => {
  const supabase = await createClient()
  const acc: FeatureAdoption = { total: 0, active: 0, menuEngineering: 0, bundles: 0, app: 0, lalamove: 0 }

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from('tenants')
      .select('is_active, menu_engineering_enabled, bundles_enabled, app_enabled, lalamove_enabled')
      .range(from, from + PAGE - 1)
    if (error) break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]) ?? []
    for (const r of rows) {
      acc.total += 1
      if (r.is_active) acc.active += 1
      if (r.menu_engineering_enabled) acc.menuEngineering += 1
      if (r.bundles_enabled) acc.bundles += 1
      if (r.app_enabled) acc.app += 1
      if (r.lalamove_enabled) acc.lalamove += 1
    }
    if (rows.length < PAGE) break
  }
  return acc
})
