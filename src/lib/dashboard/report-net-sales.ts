/**
 * The dashboard's headline Net sales, Orders and Average order on a platform
 * store, read from the SAME report function as /admin/reports
 * (`report_sales_summary` via `readTotals`) for exactly the windows the
 * Overview covers, so the two screens can never print different figures.
 *
 * Read through the CALLER's session client (RLS + the `reports` key apply;
 * `analytics`, which the dashboard asks for, implies it). The cached Overview
 * is computed by the same sales model over the same orders, so it already
 * agrees; the report read makes the headline the report's own number. When it
 * fails the Overview's figures stand (same definition) and the failure is
 * logged by `report-rpc.ts`.
 */

import { fromCents } from '@/lib/reports/money'
import { readTotals, type ReportRpcClient, type ReportWindow } from '@/lib/reports/read/report-rpc'
import { percentChange, type DashboardOverview, type Kpi, type OverviewBounds } from './overview'

export interface HeadlineTotals {
  netCents: number
  orders: number
}

export interface ReportHeadline {
  current: HeadlineTotals
  previous: HeadlineTotals
}

export interface ReportHeadlineRequest {
  tenantId: string
  /** The viewer's branch (branch-locked accounts); null = the whole store. */
  outletId: string | null
  bounds: OverviewBounds
  /** When the Overview was computed; decides which months are finished. */
  now: number
}

/** Both windows' totals, or null when either read failed. */
export async function readReportHeadline(
  client: ReportRpcClient,
  request: ReportHeadlineRequest,
): Promise<ReportHeadline | null> {
  const window = (start: number, end: number): ReportWindow => ({
    tenantId: request.tenantId,
    start,
    end,
    branch: { p_outlet: request.outletId, p_unassigned: false },
    now: request.now,
  })
  const { bounds } = request
  const [current, previous] = await Promise.all([
    readTotals(client, window(bounds.start, bounds.end)),
    readTotals(client, window(bounds.previousStart, bounds.previousEnd)),
  ])
  if (!current.ok || !previous.ok) return null
  return {
    current: { netCents: current.data.netCents, orders: current.data.orders },
    previous: { netCents: previous.data.netCents, orders: previous.data.orders },
  }
}

function withTotals(kpi: Kpi, current: number, previous: number): Kpi {
  return { ...kpi, current, previous, change: percentChange(current, previous) }
}

/** The reports' average order: net sales ÷ orders, rounded to the centavo (`summarizeSales` aovCents). */
function averageOrder(totals: HeadlineTotals): number {
  return totals.orders > 0 ? fromCents(Math.round(totals.netCents / totals.orders)) : 0
}

/** The Overview with its headline figures replaced by the report's. The per-bucket series stay the Overview's. */
export function applyReportHeadline(overview: DashboardOverview, headline: ReportHeadline): DashboardOverview {
  const { current, previous } = headline
  const { kpis } = overview
  return {
    ...overview,
    kpis: {
      ...kpis,
      sales: withTotals(kpis.sales, fromCents(current.netCents), fromCents(previous.netCents)),
      orders: withTotals(kpis.orders, current.orders, previous.orders),
      avgOrder: withTotals(kpis.avgOrder, averageOrder(current), averageOrder(previous)),
    },
  }
}

/**
 * A net-sales Overview with the report's headline; any other Overview (a
 * Convex store's bill totals) is returned as it is.
 */
export async function withReportHeadline(
  overview: DashboardOverview,
  client: ReportRpcClient,
  request: Omit<ReportHeadlineRequest, 'bounds'>,
): Promise<DashboardOverview> {
  if (overview.basis !== 'net_sales') return overview
  const headline = await readReportHeadline(client, { ...request, bounds: overview.bounds })
  return headline ? applyReportHeadline(overview, headline) : overview
}
