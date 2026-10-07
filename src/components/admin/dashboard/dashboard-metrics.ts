/**
 * The key-metric tiles at the top of the dashboard, each carrying the series
 * its chart draws. Which tiles appear follows what the account may see:
 * customer tiles need the `customers` permission (growth data), sales tiles
 * need `analytics` (overview data).
 *
 * Pure and serialisable, so the server builds it and the client chart renders it.
 */

import type { CustomerSummary } from '@/lib/growth/customer-summary'
import type { DashboardOverview, Kpi } from '@/lib/dashboard/overview'
import { shortChange, type ChangeNote } from './dashboard-copy'

export type MetricKey = 'newCustomers' | 'returningCustomers' | 'sales' | 'orders' | 'avgOrder'

export interface MetricTile {
  key: MetricKey
  label: string
  kind: 'money' | 'count'
  value: number
  previous: number
  change: ChangeNote
  /** Current window per bucket; null for buckets still in the future. */
  series: Array<number | null>
  previousSeries: number[]
}

interface MetricInput {
  customers: CustomerSummary | null
  overview: DashboardOverview | null
}

function tile(
  key: MetricKey,
  label: string,
  kind: MetricTile['kind'],
  value: number,
  previous: number,
  series: MetricTile['series'],
  previousSeries: number[],
): MetricTile {
  return { key, label, kind, value, previous, change: shortChange({ current: value, previous, kind }), series, previousSeries }
}

function fromKpi(key: MetricKey, label: string, kind: MetricTile['kind'], kpi: Kpi): MetricTile {
  return tile(key, label, kind, kpi.current, kpi.previous, kpi.series, kpi.previousSeries)
}

export function buildMetricTiles({ customers, overview }: MetricInput): MetricTile[] {
  const tiles: MetricTile[] = []
  if (customers) {
    const { current, previous, trend, previousTrend } = customers
    tiles.push(
      tile(
        'newCustomers',
        'New customers',
        'count',
        current.newCustomers,
        previous.newCustomers,
        trend.map((row) => row.new),
        previousTrend.map((row) => row.new),
      ),
      tile(
        'returningCustomers',
        'Returning customers',
        'count',
        current.returningCustomers,
        previous.returningCustomers,
        trend.map((row) => row.returning),
        previousTrend.map((row) => row.returning),
      ),
    )
  }
  if (overview) {
    tiles.push(
      fromKpi('sales', 'Sales', 'money', overview.kpis.sales),
      fromKpi('orders', 'Orders', 'count', overview.kpis.orders),
    )
    // Four tiles fit one row; without the customer pair, average order takes a slot.
    if (!customers) tiles.push(fromKpi('avgOrder', 'Average order', 'money', overview.kpis.avgOrder))
  }
  return tiles
}
