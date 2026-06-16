import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Platform-wide analytics for the superadmin dashboard.
 *
 * Design notes (driven by the real production data shape):
 * - Recent order volume is very low (often 0 in the last 7 days), so the UI
 *   defaults to longer windows. Ranges: 7d / 30d / 90d / all.
 * - `order_type` and `payment_method_name` are free-text and extremely messy
 *   (60+ payment variants: "Gcash" / "G-Cash" / "GCASH" / "G cash" ...), so we
 *   normalize them into canonical buckets before aggregating. Raw grouping
 *   would produce dozens of meaningless slices.
 * - PostgREST caps a single select at 1000 rows. We paginate to fetch the full
 *   window (current scale ~1.7k orders). For much larger scale, move these
 *   aggregations into a Postgres RPC / materialized view.
 */

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all'

export interface RangeKpis {
  gmv: number
  orders: number
  aov: number
  /** delivered / completed orders in the window */
  completed: number
  cancelled: number
  /** cancelled / orders */
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

interface OrderRow {
  created_at: string
  total: number | null
  status: string | null
  order_type: string | null
  payment_method_name: string | null
  tenant_id: string
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // PH has no DST
const PAGE = 1000
const MAX_ROWS = 50000 // safety cap

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── normalization ──────────────────────────────────────────────────────────

/** Canonical fulfillment funnel ordering. */
export const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

function normalizePayment(raw: string | null): string {
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

function normalizeOrderType(raw: string | null): string {
  if (!raw || !raw.trim()) return 'Unspecified'
  const s = raw.toLowerCase()
  if (s.includes('dine')) return 'Dine In'
  if (s.includes('pick')) return 'Pick Up'
  if (s.includes('delivery') || s.includes('deliver') || s.includes('lalamove')) return 'Delivery'
  if (s.includes('walk') || s.includes('visit')) return 'Walk-in'
  return 'Other'
}

// ── window helpers ─────────────────────────────────────────────────────────

function rangeDays(range: AnalyticsRange): number | null {
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

function monthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 7) // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`
}

// ── data fetch (paginated past PostgREST's 1000-row cap) ────────────────────

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

function aggregateSlices(
  rows: OrderRow[],
  keyFn: (r: OrderRow) => string,
): CategorySlice[] {
  const map = new Map<string, { count: number; revenue: number }>()
  for (const r of rows) {
    const k = keyFn(r)
    const cur = map.get(k) ?? { count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += r.total ?? 0
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count)
}

function kpisFor(rows: OrderRow[]): { gmv: number; orders: number; completed: number; cancelled: number } {
  let gmv = 0, completed = 0, cancelled = 0
  for (const r of rows) {
    gmv += r.total ?? 0
    if (r.status === 'delivered') completed += 1
    if (r.status === 'cancelled') cancelled += 1
  }
  return { gmv, orders: rows.length, completed, cancelled }
}

// ── main aggregate ─────────────────────────────────────────────────────────

export const getPlatformAnalytics = cache(async (range: AnalyticsRange): Promise<PlatformAnalytics> => {
  const days = rangeDays(range)
  const now = Date.now()
  const startISO = days ? new Date(now - days * 86400000).toISOString() : null
  // For deltas we also need the previous equal-length window.
  const prevStartISO = days ? new Date(now - 2 * days * 86400000).toISOString() : null

  // One fetch covering current + previous window (or everything for 'all').
  const fetchStart = prevStartISO ?? startISO
  const allRows = await fetchOrdersSince(fetchStart)

  const inCurrent = (r: OrderRow) => !startISO || r.created_at >= startISO
  const inPrev = (r: OrderRow) => prevStartISO != null && startISO != null && r.created_at >= prevStartISO && r.created_at < startISO

  const current = allRows.filter(inCurrent)
  const previous = days ? allRows.filter(inPrev) : []

  const cur = kpisFor(current)
  const prev = kpisFor(previous)

  const pctDelta = (now2: number, then: number): number | null => {
    if (!days) return null
    if (then === 0) return now2 === 0 ? 0 : null // null = "new" (no baseline)
    return ((now2 - then) / then) * 100
  }

  const kpis: RangeKpis = {
    gmv: cur.gmv,
    orders: cur.orders,
    aov: cur.orders ? cur.gmv / cur.orders : 0,
    completed: cur.completed,
    cancelled: cur.cancelled,
    cancelRate: cur.orders ? cur.cancelled / cur.orders : 0,
    gmvDelta: pctDelta(cur.gmv, prev.gmv),
    ordersDelta: pctDelta(cur.orders, prev.orders),
  }

  // Time series — daily for 7/30d, monthly for 90d/all (keeps the chart readable).
  const useMonthly = range === '90d' || range === 'all'
  const bucketMap = new Map<string, { orders: number; revenue: number }>()
  for (const r of current) {
    const key = useMonthly ? monthKey(r.created_at) : manilaDayKey(r.created_at)
    const cell = bucketMap.get(key) ?? { orders: 0, revenue: 0 }
    cell.orders += 1
    cell.revenue += r.total ?? 0
    bucketMap.set(key, cell)
  }
  const timeSeries: TimeBucket[] = [...bucketMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({
      date: useMonthly ? `${key}-01` : key,
      label: useMonthly ? monthLabel(key) : dayLabel(key),
      orders: v.orders,
      revenue: v.revenue,
    }))

  // Status breakdown ordered by the fulfillment funnel.
  const statusRaw = aggregateSlices(current, (r) => r.status ?? 'unknown')
  const statusBreakdown = statusRaw.sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a.label)
    const ib = STATUS_ORDER.indexOf(b.label)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  const orderTypeBreakdown = aggregateSlices(current, (r) => normalizeOrderType(r.order_type))
  const paymentBreakdown = aggregateSlices(current, (r) => normalizePayment(r.payment_method_name))

  // Top tenants by revenue.
  const byTenant = new Map<string, { orders: number; gmv: number }>()
  for (const r of current) {
    const cell = byTenant.get(r.tenant_id) ?? { orders: 0, gmv: 0 }
    cell.orders += 1
    cell.gmv += r.total ?? 0
    byTenant.set(r.tenant_id, cell)
  }
  const topIds = [...byTenant.entries()].sort((a, b) => b[1].gmv - a[1].gmv).slice(0, 8)

  let topByRevenue: TopTenant[] = []
  if (topIds.length) {
    const supabase = await createClient()
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, slug, is_active')
      .in('id', topIds.map(([id]) => id))
    const tMap = new Map((tenants ?? []).map((t) => [t.id as string, t]))
    topByRevenue = topIds.map(([id, v]) => {
      const t = tMap.get(id)
      return {
        tenantId: id,
        name: (t?.name as string) ?? 'Unknown',
        slug: (t?.slug as string) ?? '',
        isActive: (t?.is_active as boolean) ?? false,
        orders: v.orders,
        gmv: v.gmv,
        aov: v.orders ? v.gmv / v.orders : 0,
      }
    })
  }

  return {
    range,
    kpis,
    timeSeries,
    statusBreakdown,
    orderTypeBreakdown,
    paymentBreakdown,
    topByRevenue,
  }
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
