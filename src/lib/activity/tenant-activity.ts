/**
 * Per-store order activity, merged across the platform's order backends.
 *
 * Pure: the server module fetches (platform aggregate + one Convex call pair
 * per Convex store) and this decides what the numbers mean.
 *
 * The one rule this module exists to keep: a store we could not READ is never
 * reported as a store with zero orders. A dead Convex deployment and a quiet
 * shop look identical as a `0`, and the superadmin acts on the difference —
 * one needs a call about their subscription, the other about their backend.
 *
 * Orders and revenue exclude cancelled orders on both backends, so they add
 * up; cancellations are carried separately.
 */

import type { OrderBackend } from '@/lib/order-backend'

/**
 * Rows the Convex period query scans before it stops (`QUERY_LIMIT` in
 * `convex-template/convex/orders.ts`). A window that reaches it was cut off,
 * so its count is a floor, not a total.
 */
export const CONVEX_SCAN_LIMIT = 10000

export type ActivitySource = 'ok' | 'unreachable' | 'unsupported'

export interface TenantActivityStats {
  /** Non-cancelled orders in the window. */
  orders: number
  cancelled: number
  /** Sum of non-cancelled order totals in the window. */
  revenue: number
  /** Newest order ever, any status, ISO. Null when there has never been one. */
  lastOrderAt: string | null
  /** The backend stopped scanning before the window ended. */
  isTruncated: boolean
}

export interface ActivityTenant {
  tenantId: string
  name: string
  slug: string
  isActive: boolean
  backend: OrderBackend
}

export interface ConvexActivityEntry {
  source: ActivitySource
  stats: TenantActivityStats | null
  error?: string
}

export interface TenantActivityRow extends TenantActivityStats {
  tenantId: string
  name: string
  slug: string
  isActive: boolean
  backend: OrderBackend
  source: ActivitySource
  avgOrderValue: number
  error?: string
}

export interface ActivitySummary {
  totalStores: number
  /** Stores that took at least one non-cancelled order in the window. */
  activeStores: number
  totalOrders: number
  totalRevenue: number
  cancelled: number
  unreachableStores: number
  avgOrdersPerActiveStore: number
}

/** One row of `platform_tenant_order_activity`, as PostgREST returns it. */
export interface PlatformActivityRow {
  tenant_id: string
  orders: number | string | null
  cancelled: number | string | null
  revenue: number | string | null
  last_order_at: string | null
}

/** The subset of `orders:getDashboardStatsByPeriodInternal` read here. */
export interface ConvexPeriodStatsLike {
  totalOrders: number
  totalRevenue: number
  statusCounts?: Record<string, number>
}

const EMPTY_STATS: TenantActivityStats = {
  orders: 0,
  cancelled: 0,
  revenue: 0,
  lastOrderAt: null,
  isTruncated: false,
}

/** Postgres `bigint`/`numeric` can arrive as strings; garbage becomes 0. */
function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function toIsoOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const instant = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null
}

export function platformRowsToStats(
  rows: readonly PlatformActivityRow[]
): Map<string, TenantActivityStats> {
  return new Map(
    rows.map((row) => [
      row.tenant_id,
      {
        orders: toNumber(row.orders),
        cancelled: toNumber(row.cancelled),
        revenue: toNumber(row.revenue),
        lastOrderAt: toIsoOrNull(row.last_order_at),
        isTruncated: false,
      },
    ])
  )
}

export function convexToStats(
  period: ConvexPeriodStatsLike,
  latest: { _creationTime?: number } | null
): TenantActivityStats {
  const statusCounts = period.statusCounts ?? {}
  const scanned = Object.values(statusCounts).reduce((sum, count) => sum + toNumber(count), 0)

  return {
    orders: toNumber(period.totalOrders),
    cancelled: toNumber(statusCounts.cancelled),
    revenue: toNumber(period.totalRevenue),
    lastOrderAt: toIsoOrNull(latest?._creationTime),
    isTruncated: scanned >= CONVEX_SCAN_LIMIT,
  }
}

function resolveEntry(
  tenant: ActivityTenant,
  platformStats: ReadonlyMap<string, TenantActivityStats> | null,
  convexEntries: ReadonlyMap<string, ConvexActivityEntry>
): ConvexActivityEntry {
  if (tenant.backend === 'supabase') return { source: 'unsupported', stats: null }

  if (tenant.backend === 'platform') {
    if (!platformStats) return { source: 'unreachable', stats: null }
    // The aggregate only lists stores that have ever had an order; absence
    // is a real zero.
    return {
      source: 'ok',
      stats: platformStats.get(tenant.tenantId) ?? EMPTY_STATS,
    }
  }

  // No entry means there was nothing to call — a Convex store without a
  // deploy key.
  return (
    convexEntries.get(tenant.tenantId) ?? {
      source: 'unreachable',
      stats: null,
      error: 'No Convex deploy key',
    }
  )
}

function compareRows(a: TenantActivityRow, b: TenantActivityRow): number {
  if (a.orders !== b.orders) return b.orders - a.orders
  if (a.revenue !== b.revenue) return b.revenue - a.revenue
  const byLast = (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '')
  return byLast !== 0 ? byLast : a.name.localeCompare(b.name)
}

/** One row per store, busiest first. */
export function buildActivityRows(
  tenants: readonly ActivityTenant[],
  platformStats: ReadonlyMap<string, TenantActivityStats> | null,
  convexEntries: ReadonlyMap<string, ConvexActivityEntry>
): TenantActivityRow[] {
  return tenants
    .map((tenant): TenantActivityRow => {
      const entry = resolveEntry(tenant, platformStats, convexEntries)
      const stats = entry.stats ?? EMPTY_STATS
      return {
        ...tenant,
        ...stats,
        source: entry.source,
        avgOrderValue: stats.orders > 0 ? stats.revenue / stats.orders : 0,
        ...(entry.error ? { error: entry.error } : {}),
      }
    })
    .sort(compareRows)
}

export function summarizeActivity(rows: readonly TenantActivityRow[]): ActivitySummary {
  const totals = rows.reduce(
    (acc, row) => ({
      activeStores: acc.activeStores + (row.source === 'ok' && row.orders > 0 ? 1 : 0),
      totalOrders: acc.totalOrders + row.orders,
      totalRevenue: acc.totalRevenue + row.revenue,
      cancelled: acc.cancelled + row.cancelled,
      unreachableStores: acc.unreachableStores + (row.source === 'unreachable' ? 1 : 0),
    }),
    {
      activeStores: 0,
      totalOrders: 0,
      totalRevenue: 0,
      cancelled: 0,
      unreachableStores: 0,
    }
  )

  return {
    totalStores: rows.length,
    ...totals,
    avgOrdersPerActiveStore: totals.activeStores > 0 ? totals.totalOrders / totals.activeStores : 0,
  }
}
