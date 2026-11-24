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
import type { SalesBasis } from '@/lib/dashboard/sale-record'
import { METRIC_GLOSSARY } from '@/lib/reports/metric-glossary'
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
  /** What the figure counts, shown under the chart. */
  hint?: string
  /** What fills an empty chart. */
  emptyHint?: string
}

/** The sales tiles' wording per basis: net sales say exactly what the reports say. */
const SALES_WORDING: Readonly<
  Record<SalesBasis, { salesLabel: string; sales: string; orders: string; avgOrder: string; empty: string }>
> = {
  net_sales: {
    salesLabel: 'Net sales',
    sales: `${METRIC_GLOSSARY.net.definition} Orders not paid yet count too, the same as in Reports.`,
    orders: METRIC_GLOSSARY.orders.definition,
    avgOrder: `${METRIC_GLOSSARY.aov.definition} Delivery fees and service charge are not included.`,
    empty: 'This fills in as orders come in.',
  },
  completed_totals: {
    salesLabel: 'Sales',
    sales: 'Order totals of paid counter sales and delivered online orders. Delivery fees and service charge are included.',
    orders: 'Paid counter sales and delivered online orders.',
    avgOrder: 'Sales per order, delivery fees and service charge included.',
    empty: 'This fills in as orders are paid or delivered.',
  },
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

function fromKpi(
  key: MetricKey,
  label: string,
  kind: MetricTile['kind'],
  kpi: Kpi,
  wording: { hint: string; emptyHint: string },
): MetricTile {
  return { ...tile(key, label, kind, kpi.current, kpi.previous, kpi.series, kpi.previousSeries), ...wording }
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
    const wording = SALES_WORDING[overview.basis] ?? SALES_WORDING.completed_totals
    const emptyHint = wording.empty
    tiles.push(
      fromKpi('sales', wording.salesLabel, 'money', overview.kpis.sales, { hint: wording.sales, emptyHint }),
      fromKpi('orders', 'Orders', 'count', overview.kpis.orders, { hint: wording.orders, emptyHint }),
    )
    // Four tiles fit one row; without the customer pair, average order takes a slot.
    if (!customers) {
      tiles.push(fromKpi('avgOrder', 'Average order', 'money', overview.kpis.avgOrder, { hint: wording.avgOrder, emptyHint }))
    }
  }
  return tiles
}
