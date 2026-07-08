/**
 * Pure aggregation + merge logic for the superadmin platform analytics.
 *
 * The platform is multi-backend: a tenant's orders live in EITHER its own Convex
 * deployment (when `convex_deployment_url` + `convex_deploy_key` are set) OR the
 * shared Supabase `orders` table. The superadmin dashboard must combine both.
 *
 * This module is intentionally free of I/O so every branch is unit-testable. The
 * server module fetches raw data (Supabase rows + per-tenant Convex aggregates)
 * and feeds it through {@link buildPlatformAnalytics}.
 *
 * Revenue semantics: GMV and order counts EXCLUDE cancelled orders (matching the
 * Convex queries, which already filter `status !== "cancelled"`). Cancelled and
 * completed counts are still surfaced via `statusCounts` for the funnel and the
 * cancel-rate KPI.
 */

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all'

export interface RangeKpis {
  gmv: number
  orders: number
  aov: number
  /** delivered / completed orders in the window */
  completed: number
  cancelled: number
  /** cancelled / (cancelled + non-cancelled orders) */
  cancelRate: number
  /** % change vs the immediately-preceding equal-length window (null for 'all') */
  gmvDelta: number | null
  ordersDelta: number | null
}

export interface TimeBucket {
  /** ISO date of the bucket start (YYYY-MM-DD) */
  date: string
  /** human label, e.g. "Jun 14" or "Jun '26" */
  label: string
  orders: number
  revenue: number
}

export interface CategorySlice {
  label: string
  count: number
  /** sum of order totals in this slice */
  revenue: number
}

export interface TopTenant {
  tenantId: string
  name: string
  slug: string
  isActive: boolean
  orders: number
  gmv: number
  aov: number
}

export interface PlatformAnalytics {
  range: AnalyticsRange
  kpis: RangeKpis
  timeSeries: TimeBucket[]
  /** ordered by fulfillment funnel sequence */
  statusBreakdown: CategorySlice[]
  orderTypeBreakdown: CategorySlice[]
  paymentBreakdown: CategorySlice[]
  topByRevenue: TopTenant[]
}

/** Normalized per-tenant aggregate for a single window. Produced by both the
 *  Supabase and Convex paths so the merge step is source-agnostic. */
export interface TenantWindowAggregate {
  tenantId: string
  /** non-cancelled order count in the current window */
  orders: number
  /** sum of non-cancelled order totals in the current window */
  gmv: number
  /** delivered orders in the current window */
  completed: number
  /** cancelled orders in the current window */
  cancelled: number
  /** non-cancelled order count in the previous equal-length window (null for 'all') */
  prevOrders: number | null
  /** non-cancelled gmv in the previous equal-length window (null for 'all') */
  prevGmv: number | null
  /** non-cancelled daily buckets, keyed by Manila YYYY-MM-DD */
  daily: Record<string, { orders: number; revenue: number }>
  /** counts across ALL statuses (incl. cancelled) for the funnel */
  statusCounts: Record<string, number>
  /** non-cancelled, normalized order-type slices */
  orderType: Record<string, { count: number; revenue: number }>
  /** non-cancelled, normalized payment slices */
  payment: Record<string, { count: number; revenue: number }>
}

export interface TenantMeta {
  name: string
  slug: string
  isActive: boolean
}

export interface OrderRow {
  created_at: string
  total: number | null
  status: string | null
  order_type: string | null
  payment_method_name: string | null
  tenant_id: string
}

// ── constants ────────────────────────────────────────────────────────────────

const DAY_MS = 86400000
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // PH has no DST
const LEADERBOARD_SIZE = 8
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Canonical fulfillment funnel ordering. */
export const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

// ── normalization ────────────────────────────────────────────────────────────

export function normalizePayment(raw: string | null): string {
  if (!raw || !raw.trim()) return 'Unspecified'
  const s = raw.toLowerCase()
  if (s.includes('gcash') || s.replace(/[\s-]/g, '').includes('gcash')) return 'GCash'
  if (s.includes('cod') || s.includes('cash on delivery') || s.includes('cash on deliver')) return 'Cash on Delivery'
  if (s.includes('maya')) return 'Maya'
  if (
    s.includes('bank') || s.includes('transfer') || s.includes('bpi') || s.includes('bdo') ||
    s.includes('union') || s.includes('rcbc') || s.includes('aub') || s.includes('instapay') ||
    s.includes('gotyme') || s.includes('go tyme') || s.includes('maribank') || s.includes('seabank')
  ) return 'Bank Transfer'
  if (s.includes('counter') || s.includes('over the counter') || s.includes('otc')) return 'Over the Counter'
  if (s.includes('cash')) return 'Cash'
  if (s.includes('qr')) return 'QR Ph'
  return 'Other'
}

export function normalizeOrderType(raw: string | null): string {
  if (!raw || !raw.trim()) return 'Unspecified'
  const s = raw.toLowerCase()
  if (s.includes('dine')) return 'Dine In'
  if (s.includes('pick')) return 'Pick Up'
  if (s.includes('delivery') || s.includes('deliver') || s.includes('lalamove')) return 'Delivery'
  if (s.includes('walk') || s.includes('visit')) return 'Walk-in'
  return 'Other'
}

// ── date helpers ─────────────────────────────────────────────────────────────

export function rangeDays(range: AnalyticsRange): number | null {
  switch (range) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case 'all': return null
  }
}

function manilaDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function dayLabel(key: string): string {
  const [, m, d] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`
}

// ── windows ──────────────────────────────────────────────────────────────────

export interface AnalyticsWindows {
  days: number | null
  /** current-window start (ms); null = from the beginning of time ('all') */
  startMs: number | null
  endMs: number
  /** previous equal-length window start (ms); null for 'all' */
  prevStartMs: number | null
  /** previous equal-length window end (ms); null for 'all' */
  prevEndMs: number | null
}

export function rangeToWindows(range: AnalyticsRange, now: number): AnalyticsWindows {
  const days = rangeDays(range)
  if (days == null) {
    return { days: null, startMs: null, endMs: now, prevStartMs: null, prevEndMs: null }
  }
  const startMs = now - days * DAY_MS
  return {
    days,
    startMs,
    endMs: now,
    prevStartMs: now - 2 * days * DAY_MS,
    prevEndMs: startMs,
  }
}

// ── aggregate builders ───────────────────────────────────────────────────────

export function emptyAggregate(tenantId: string): TenantWindowAggregate {
  return {
    tenantId,
    orders: 0,
    gmv: 0,
    completed: 0,
    cancelled: 0,
    prevOrders: null,
    prevGmv: null,
    daily: {},
    statusCounts: {},
    orderType: {},
    payment: {},
  }
}

// Convex response shapes (subset of the fields we consume).
export interface ConvexPeriodStats {
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  statusCounts: Record<string, number>
}
export interface ConvexTrendBucket {
  date: string
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
}
export interface ConvexRevenueBreakdown {
  byOrderType: { type: string; revenue: number; count: number }[]
  byPaymentMethod: { method: string; revenue: number; count: number }[]
}
export interface ConvexResponses {
  current: ConvexPeriodStats
  prev: ConvexPeriodStats | null
  trends: ConvexTrendBucket[]
  breakdown: ConvexRevenueBreakdown | null
}

function accumulateSlice(
  target: Record<string, { count: number; revenue: number }>,
  label: string,
  count: number,
  revenue: number,
): void {
  const cur = target[label] ?? { count: 0, revenue: 0 }
  cur.count += count
  cur.revenue += revenue
  target[label] = cur
}

export function convexResponsesToAggregate(tenantId: string, r: ConvexResponses): TenantWindowAggregate {
  const agg = emptyAggregate(tenantId)
  agg.orders = r.current.totalOrders
  agg.gmv = r.current.totalRevenue
  agg.completed = r.current.statusCounts?.delivered ?? 0
  agg.cancelled = r.current.statusCounts?.cancelled ?? 0
  agg.statusCounts = { ...(r.current.statusCounts ?? {}) }
  agg.prevOrders = r.prev ? r.prev.totalOrders : null
  agg.prevGmv = r.prev ? r.prev.totalRevenue : null

  for (const b of r.trends ?? []) {
    agg.daily[b.date] = { orders: b.totalOrders, revenue: b.totalRevenue }
  }

  if (r.breakdown) {
    for (const s of r.breakdown.byOrderType ?? []) {
      accumulateSlice(agg.orderType, normalizeOrderType(s.type), s.count, s.revenue)
    }
    for (const s of r.breakdown.byPaymentMethod ?? []) {
      accumulateSlice(agg.payment, normalizePayment(s.method), s.count, s.revenue)
    }
  }

  return agg
}

export function rowsToTenantAggregates(
  rows: OrderRow[],
  windows: AnalyticsWindows,
  excludeTenantIds: ReadonlySet<string>,
): TenantWindowAggregate[] {
  const byTenant = new Map<string, TenantWindowAggregate>()
  const get = (id: string): TenantWindowAggregate => {
    let a = byTenant.get(id)
    if (!a) {
      a = emptyAggregate(id)
      byTenant.set(id, a)
    }
    return a
  }

  for (const r of rows) {
    if (excludeTenantIds.has(r.tenant_id)) continue
    const t = new Date(r.created_at).getTime()
    const inCurrent = windows.startMs == null ? true : t >= windows.startMs && t <= windows.endMs
    const inPrev =
      windows.prevStartMs != null && windows.startMs != null && t >= windows.prevStartMs && t < windows.startMs

    if (!inCurrent && !inPrev) continue
    const agg = get(r.tenant_id)
    const total = Number(r.total) || 0
    const isCancelled = r.status === 'cancelled'

    if (inPrev) {
      if (agg.prevOrders == null) agg.prevOrders = 0
      if (agg.prevGmv == null) agg.prevGmv = 0
      if (!isCancelled) {
        agg.prevOrders += 1
        agg.prevGmv += total
      }
      continue
    }

    // current window
    const status = r.status ?? 'unknown'
    agg.statusCounts[status] = (agg.statusCounts[status] ?? 0) + 1
    if (r.status === 'delivered') agg.completed += 1
    if (isCancelled) {
      agg.cancelled += 1
      continue // cancelled excluded from gmv / orders / daily / breakdowns
    }
    agg.orders += 1
    agg.gmv += total
    const key = manilaDayKey(r.created_at)
    const cell = agg.daily[key] ?? { orders: 0, revenue: 0 }
    cell.orders += 1
    cell.revenue += total
    agg.daily[key] = cell
    accumulateSlice(agg.orderType, normalizeOrderType(r.order_type), 1, total)
    accumulateSlice(agg.payment, normalizePayment(r.payment_method_name), 1, total)
  }

  return [...byTenant.values()]
}

// ── final assembly ───────────────────────────────────────────────────────────

function pctDelta(now: number, then: number | null, hasPrev: boolean): number | null {
  if (!hasPrev || then == null) return null
  if (then === 0) return now === 0 ? 0 : null
  return ((now - then) / then) * 100
}

export function buildPlatformAnalytics(
  range: AnalyticsRange,
  aggregates: TenantWindowAggregate[],
  tenantMeta: Record<string, TenantMeta>,
): PlatformAnalytics {
  const hasPrev = range !== 'all'

  let gmv = 0
  let orders = 0
  let completed = 0
  let cancelled = 0
  let prevGmv: number | null = null
  let prevOrders: number | null = null
  const daily = new Map<string, { orders: number; revenue: number }>()
  const statusCounts = new Map<string, number>()
  const orderTypeMap = new Map<string, { count: number; revenue: number }>()
  const paymentMap = new Map<string, { count: number; revenue: number }>()

  const mergeSlices = (
    target: Map<string, { count: number; revenue: number }>,
    src: Record<string, { count: number; revenue: number }>,
  ) => {
    for (const [label, v] of Object.entries(src)) {
      const cur = target.get(label) ?? { count: 0, revenue: 0 }
      cur.count += v.count
      cur.revenue += v.revenue
      target.set(label, cur)
    }
  }

  for (const a of aggregates) {
    gmv += a.gmv
    orders += a.orders
    completed += a.completed
    cancelled += a.cancelled
    if (a.prevGmv != null) prevGmv = (prevGmv ?? 0) + a.prevGmv
    if (a.prevOrders != null) prevOrders = (prevOrders ?? 0) + a.prevOrders

    for (const [key, cell] of Object.entries(a.daily)) {
      const cur = daily.get(key) ?? { orders: 0, revenue: 0 }
      cur.orders += cell.orders
      cur.revenue += cell.revenue
      daily.set(key, cur)
    }
    for (const [status, count] of Object.entries(a.statusCounts)) {
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + count)
    }
    mergeSlices(orderTypeMap, a.orderType)
    mergeSlices(paymentMap, a.payment)
  }

  const totalIncludingCancelled = orders + cancelled

  const kpis: RangeKpis = {
    gmv,
    orders,
    aov: orders ? gmv / orders : 0,
    completed,
    cancelled,
    cancelRate: totalIncludingCancelled ? cancelled / totalIncludingCancelled : 0,
    gmvDelta: pctDelta(gmv, prevGmv, hasPrev),
    ordersDelta: pctDelta(orders, prevOrders, hasPrev),
  }

  // Time series — daily for 7/30d, monthly for 90d/all (keeps the chart readable).
  const useMonthly = range === '90d' || range === 'all'
  const bucketMap = new Map<string, { orders: number; revenue: number }>()
  for (const [dayKey, cell] of daily) {
    const key = useMonthly ? dayKey.slice(0, 7) : dayKey
    const cur = bucketMap.get(key) ?? { orders: 0, revenue: 0 }
    cur.orders += cell.orders
    cur.revenue += cell.revenue
    bucketMap.set(key, cur)
  }
  const timeSeries: TimeBucket[] = [...bucketMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({
      date: useMonthly ? `${key}-01` : key,
      label: useMonthly ? monthLabel(key) : dayLabel(key),
      orders: v.orders,
      revenue: v.revenue,
    }))

  const statusBreakdown: CategorySlice[] = [...statusCounts.entries()]
    .map(([label, count]) => ({ label, count, revenue: 0 }))
    .sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.label)
      const ib = STATUS_ORDER.indexOf(b.label)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  const slicesToArray = (m: Map<string, { count: number; revenue: number }>): CategorySlice[] =>
    [...m.entries()]
      .map(([label, v]) => ({ label, count: v.count, revenue: v.revenue }))
      .sort((a, b) => b.count - a.count)

  const orderTypeBreakdown = slicesToArray(orderTypeMap)
  const paymentBreakdown = slicesToArray(paymentMap)

  // Leaderboard — ranked by order ACTIVITY (the "most active restaurant"), with
  // revenue shown alongside. Tiebreak by gmv.
  const topByRevenue: TopTenant[] = aggregates
    .filter((a) => a.orders > 0 || a.gmv > 0)
    .sort((a, b) => b.orders - a.orders || b.gmv - a.gmv)
    .slice(0, LEADERBOARD_SIZE)
    .map((a) => {
      const meta = tenantMeta[a.tenantId]
      return {
        tenantId: a.tenantId,
        name: meta?.name ?? 'Unknown',
        slug: meta?.slug ?? '',
        isActive: meta?.isActive ?? false,
        orders: a.orders,
        gmv: a.gmv,
        aov: a.orders ? a.gmv / a.orders : 0,
      }
    })

  return {
    range,
    kpis,
    timeSeries,
    statusBreakdown,
    orderTypeBreakdown,
    paymentBreakdown,
    topByRevenue,
  }
}
