/**
 * The Overview tab: how much the store sold, through which doors, of what, and
 * when — each figure against the window of the same length just before it.
 *
 * Pure. Only completed sales count (see `sale-record.ts`).
 */

import {
  SALE_CHANNEL_LABELS,
  isCompletedSale,
  type SaleChannel,
  type SaleRecord,
} from './sale-record'
import {
  bucketIndex,
  bucketLabels,
  elapsedBuckets,
  formatHourLabel,
  isInCurrent,
  isInPrevious,
  manilaHour,
  type DashboardWindow,
} from './periods'

const TOP_ITEM_LIMIT = 6

export type KpiKey = 'sales' | 'orders' | 'avgOrder' | 'customers'

export interface Kpi {
  key: KpiKey
  current: number
  previous: number
  /** Percent change; null when there is nothing to compare with. */
  change: number | null
  /** Per-bucket values of the current window; null for buckets still in the future. */
  series: Array<number | null>
  previousSeries: number[]
}

export interface BreakdownRow {
  key: string
  label: string
  sales: number
  orders: number
  /** Share of sales, 0–100. */
  share: number
}

export interface TopItem {
  key: string
  name: string
  quantity: number
  revenue: number
}

export interface HourRow {
  hour: number
  label: string
  orders: number
  sales: number
}

export interface DashboardOverview {
  labels: string[]
  kpis: Record<KpiKey, Kpi>
  channels: BreakdownRow[]
  orderTypes: BreakdownRow[]
  /** Null when line items could not be read. */
  topItems: TopItem[] | null
  hours: HourRow[]
  busiestHour: HourRow | null
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

interface BucketAccumulator {
  sales: number[]
  orders: number[]
  customers: Array<Set<string>>
}

function emptyBuckets(count: number): BucketAccumulator {
  return {
    sales: Array(count).fill(0),
    orders: Array(count).fill(0),
    customers: Array.from({ length: count }, () => new Set<string>()),
  }
}

function addToBucket(acc: BucketAccumulator, index: number | null, sale: SaleRecord): void {
  if (index === null) return
  acc.sales[index] += sale.total
  acc.orders[index] += 1
  if (sale.phone) acc.customers[index].add(sale.phone)
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function uniqueCount(sales: readonly SaleRecord[]): number {
  return new Set(sales.flatMap((sale) => (sale.phone ? [sale.phone] : []))).size
}

function buildKpi(
  key: KpiKey,
  current: number,
  previous: number,
  series: number[],
  previousSeries: number[],
  elapsed: number,
): Kpi {
  return {
    key,
    current: round2(current),
    previous: round2(previous),
    change: percentChange(current, previous),
    series: series.map((value, i) => (i < elapsed ? round2(value) : null)),
    previousSeries: previousSeries.map(round2),
  }
}

function divide(numerators: number[], denominators: number[]): number[] {
  return numerators.map((value, i) => (denominators[i] > 0 ? value / denominators[i] : 0))
}

function buildKpis(
  window: DashboardWindow,
  current: SaleRecord[],
  previous: SaleRecord[],
): Record<KpiKey, Kpi> {
  const now = emptyBuckets(window.bucketCount)
  const before = emptyBuckets(window.bucketCount)
  for (const sale of current) addToBucket(now, bucketIndex(window, window.start, sale.at), sale)
  for (const sale of previous) addToBucket(before, bucketIndex(window, window.previousStart, sale.at), sale)

  const elapsed = elapsedBuckets(window)
  const sales = sum(now.sales)
  const previousSales = sum(before.sales)
  const orders = current.length
  const previousOrders = previous.length

  return {
    sales: buildKpi('sales', sales, previousSales, now.sales, before.sales, elapsed),
    orders: buildKpi('orders', orders, previousOrders, now.orders, before.orders, elapsed),
    avgOrder: buildKpi(
      'avgOrder',
      orders > 0 ? sales / orders : 0,
      previousOrders > 0 ? previousSales / previousOrders : 0,
      divide(now.sales, now.orders),
      divide(before.sales, before.orders),
      elapsed,
    ),
    customers: buildKpi(
      'customers',
      uniqueCount(current),
      uniqueCount(previous),
      now.customers.map((set) => set.size),
      before.customers.map((set) => set.size),
      elapsed,
    ),
  }
}

function breakdown(
  sales: readonly SaleRecord[],
  keyOf: (sale: SaleRecord) => string,
  labelOf: (key: string) => string,
): BreakdownRow[] {
  const total = sum(sales.map((sale) => sale.total))
  const rows = new Map<string, { sales: number; orders: number }>()
  for (const sale of sales) {
    const key = keyOf(sale)
    const row = rows.get(key) ?? { sales: 0, orders: 0 }
    rows.set(key, { sales: row.sales + sale.total, orders: row.orders + 1 })
  }
  return [...rows.entries()]
    .map(([key, row]) => ({
      key,
      label: labelOf(key),
      sales: round2(row.sales),
      orders: row.orders,
      share: total > 0 ? Math.round((row.sales / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sales - a.sales || b.orders - a.orders)
}

export function rankTopItems(sales: readonly SaleRecord[], limit: number = TOP_ITEM_LIMIT): TopItem[] | null {
  if (sales.length > 0 && sales.every((sale) => sale.items === null)) return null
  const totals = new Map<string, TopItem>()
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      const name = item.name.trim()
      if (!name) continue
      const key = item.menuItemId ? `id:${item.menuItemId}` : `name:${name.toLowerCase()}`
      const existing = totals.get(key)
      totals.set(key, {
        key,
        name: existing?.name ?? name,
        quantity: (existing?.quantity ?? 0) + Math.max(0, item.quantity),
        revenue: round2((existing?.revenue ?? 0) + Math.max(0, item.revenue)),
      })
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.key.localeCompare(b.key))
    .slice(0, limit)
}

export function buildHourProfile(sales: readonly SaleRecord[]): HourRow[] {
  const rows: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    orders: 0,
    sales: 0,
  }))
  for (const sale of sales) {
    const row = rows[manilaHour(sale.at)]
    rows[row.hour] = { ...row, orders: row.orders + 1, sales: round2(row.sales + sale.total) }
  }
  return rows
}

/** The single hour with the most orders; a tie at the top names none, since no hour stands out. */
function pickBusiestHour(hours: readonly HourRow[]): HourRow | null {
  const top = Math.max(0, ...hours.map((row) => row.orders))
  if (top === 0) return null
  const leaders = hours.filter((row) => row.orders === top)
  return leaders.length === 1 ? leaders[0] : null
}

export function buildOverview(sales: readonly SaleRecord[], window: DashboardWindow): DashboardOverview {
  const completed = sales.filter(isCompletedSale)
  const current = completed.filter((sale) => isInCurrent(window, sale.at))
  const previous = completed.filter((sale) => isInPrevious(window, sale.at))
  const hours = buildHourProfile(current)
  const busiest = pickBusiestHour(hours)

  return {
    labels: bucketLabels(window),
    kpis: buildKpis(window, current, previous),
    channels: breakdown(current, (sale) => sale.channel, (key) => SALE_CHANNEL_LABELS[key as SaleChannel] ?? key),
    orderTypes: breakdown(current, (sale) => sale.orderType, (key) => key),
    topItems: rankTopItems(current),
    hours,
    busiestHour: busiest,
  }
}
