/** @jest-environment node */
/**
 * One sales number (plan 2026-11-24 §B): on a platform store the admin
 * dashboard's money is the reports' NET SALES — every live order (unpaid ones
 * included), after discounts, without delivery fees or service charge — and
 * its headline is the report function's own figure for the same windows.
 *
 * Koko Coffee, Nov 1–24: reports ₱25,110, dashboard ₱25,250 (Σ bill totals of
 * "completed" sales: + ₱140 delivery fees, − an unpaid ₱75 order …).
 */
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { buildOverview, type DashboardOverview } from '@/lib/dashboard/overview'
import { DAY_MS, HOUR_MS, resolveDashboardWindow } from '@/lib/dashboard/periods'
import { applyReportHeadline, withReportHeadline } from '@/lib/dashboard/report-net-sales'
import { buildMetricTiles } from '@/components/admin/dashboard/dashboard-metrics'
import { fromCents } from '@/lib/reports/money'
import { resolveReportPeriod } from '@/lib/reports/period'
import { toReportOrder, type PlatformOrderItemRow, type PlatformOrderRow } from '@/lib/reports/read/platform-order-row'
import type { ReportRpcClient } from '@/lib/reports/read/report-rpc'
import { summarizeSales } from '@/lib/reports/sales-model'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'

jest.mock('server-only', () => ({}))

const TENANT = '00000000-0000-4000-8000-000000000001'
const NOW = Date.parse('2026-11-24T14:00:00+08:00')
const window = resolveDashboardWindow('7d', NOW)
const today = (hour: number) => Date.parse('2026-11-24T00:00:00+08:00') + hour * HOUR_MS
const lastWeek = (hour: number) => window.previousStart + hour * HOUR_MS

const PROMO_30 = { total: 30, deliveryDiscount: 0, lines: [{ label: 'Promo', amount: 30 }], allocationsByLine: {} }
const POS_10 = { total: 10, deliveryDiscount: 0, lines: [{ label: 'Manual', amount: 10 }], allocationsByLine: {} }
const FREE_DELIVERY = { total: 50, deliveryDiscount: 50, lines: [{ label: 'Free delivery', amount: 50 }], allocationsByLine: {} }

type Row = PlatformOrderRow & { tenant_id: string; customer_contact: string | null }

function order(id: string, at: number, total: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    tenant_id: TENANT,
    customer_contact: null,
    created_at: new Date(at).toISOString(),
    status: 'confirmed',
    payment_status: 'paid',
    source: 'pos',
    order_type: 'dine_in',
    outlet_id: null,
    total,
    service_charge_amount: 0,
    delivery_fee: 0,
    discount_data: null,
    customer_data: {},
    payment_method_id: null,
    payment_method_name: null,
    ...extra,
  }
}

function line(id: string, orderId: string, name: string, quantity: number, subtotal: number): PlatformOrderItemRow {
  return { id, order_id: orderId, menu_item_id: `menu-${name}`, menu_item_name: name, category_name: 'Drinks', quantity, subtotal }
}

const ORDERS: Row[] = [
  order('paid-pos', today(9), 200),
  // ₱280 of food − ₱30 promo + ₱50 delivery = ₱300 billed; net ₱250.
  order('delivery', today(11), 300, {
    source: 'web',
    order_type: 'delivery',
    status: 'delivered',
    payment_status: 'pending',
    delivery_fee: 50,
    discount_data: PROMO_30,
  }),
  // Pay later, never paid: not "completed", still a sale in the reports.
  order('unpaid', today(12), 75, { payment_status: 'pending' }),
  // ₱100 of food + ₱10 service charge; net ₱100.
  order('service', today(12), 110, { service_charge_amount: 10 }),
  // The POS blob's discount (no discount_data column): ₱100 − ₱10 = ₱90.
  order('pos-blob', today(13), 90, { customer_data: { discount: POS_10, table_number: '4' } }),
  // Free delivery from the POS blob: ₱150 food + ₱50 fee − ₱50 off the fee = ₱150; net ₱150 (only
  // right when the blob's discount is read: without it the fee would be taken off again).
  order('free-delivery', today(13), 150, {
    order_type: 'delivery',
    delivery_fee: 50,
    customer_data: { discount: FREE_DELIVERY, delivery_address: 'Somewhere long and private' },
  }),
  order('cancelled', today(13), 999, { status: 'cancelled' }),
  order('previous', lastWeek(10), 160, { delivery_fee: 40, source: 'web', status: 'delivered' }),
]

const ITEMS: PlatformOrderItemRow[] = [
  line('l1', 'paid-pos', 'Latte', 2, 200),
  line('l2', 'delivery', 'Latte', 1, 100),
  line('l3', 'delivery', 'Cake', 2, 180),
  line('l4', 'unpaid', 'Americano', 1, 75),
  line('l5', 'service', 'Cake', 1, 100),
  line('l6', 'pos-blob', 'Americano', 1, 100),
  line('l7', 'cancelled', 'Latte', 9, 999),
  line('l8', 'free-delivery', 'Cake', 1, 150),
]

function reportOrders(rows: readonly Row[], from: number, to: number) {
  return rows
    .filter((row) => Date.parse(row.created_at) >= from && Date.parse(row.created_at) < to)
    .map((row) => toReportOrder(row, ITEMS.filter((item) => item.order_id === row.id), []))
}

async function readOverview(): Promise<DashboardOverview> {
  const { readSupabaseSales } = await import('@/lib/dashboard/read-supabase-sales')
  const { client } = fakeSupabaseTables({ orders: ORDERS, order_items: ITEMS })
  const read = await readSupabaseSales(client, TENANT, {
    readStart: window.previousStart,
    currentStart: window.start,
    now: NOW,
    outletId: null,
    includeItems: true,
    includePriorVisits: false,
  })
  expect(read.failed).toBe(false)
  expect(read.basis).toBe('net_sales')
  return buildOverview(read.sales, window, read.basis)
}

describe('platform dashboard = report net sales', () => {
  test('headline sales, orders and average order equal summarizeSales for the same orders', async () => {
    const overview = await readOverview()
    const current = summarizeSales(reportOrders(ORDERS, window.start, window.end))
    const previous = summarizeSales(reportOrders(ORDERS, window.previousStart, window.previousEnd))

    // 200 + 250 + 75 + 100 + 90 + 150: delivery fees and service charge out, unpaid in, cancelled out.
    expect(current.netCents).toBe(86_500)
    expect(overview.kpis.sales.current).toBe(fromCents(current.netCents))
    expect(overview.kpis.sales.previous).toBe(fromCents(previous.netCents))
    expect(overview.kpis.sales.previous).toBe(120)
    expect(overview.kpis.orders.current).toBe(current.orders)
    expect(overview.kpis.avgOrder.current).toBe(fromCents(current.aovCents ?? 0))
  })

  test('the chart, channels, order types, hours and best sellers add up to the same net sales', async () => {
    const overview = await readOverview()
    const net = overview.kpis.sales.current
    const sum = (values: ReadonlyArray<number | null>) => Math.round(values.reduce<number>((a, b) => a + (b ?? 0), 0) * 100) / 100

    expect(sum(overview.kpis.sales.series)).toBe(net)
    expect(sum(overview.channels.map((row) => row.sales))).toBe(net)
    expect(sum(overview.orderTypes.map((row) => row.sales))).toBe(net)
    expect(sum(overview.hours.map((row) => row.sales))).toBe(net)
    // Each dish carries its share of its order's net (as Reports › Items), so the dishes add up too.
    expect(sum((overview.topItems ?? []).map((item) => item.revenue))).toBe(net)
    expect(overview.topItems?.find((item) => item.name === 'Cake')).toMatchObject({ quantity: 4 })
  })

  test('the headline is the report function’s own figure, read for exactly the Overview’s windows and branch', async () => {
    const overview = await readOverview()
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const summaryRow = (net: number, orders: number) => ({
      orders, gross_cents: net, discount_cents: 0, delivery_discount_cents: 0, refund_cents: 0, net_cents: net,
      service_cents: 0, delivery_cents: 0, billed_cents: net, collected_cents: net, unpaid_cents: 0, overpaid_cents: 0,
      void_orders: 0, void_billed_cents: 0, orders_without_lines: 0, orders_lines_mismatch: 0, line_gap_cents: 0,
    })
    const client: ReportRpcClient = {
      rpc: async (fn, args) => {
        calls.push({ fn, args })
        const isCurrent = args.p_from === new Date(window.start).toISOString()
        return { data: [isCurrent ? summaryRow(2_511_000, 300) : summaryRow(2_000_000, 250)], error: null }
      },
    }

    const shown = await withReportHeadline(overview, client, { tenantId: TENANT, outletId: 'branch-1', now: NOW })

    expect(calls.map((call) => call.fn)).toEqual(['report_sales_summary', 'report_sales_summary'])
    expect(calls[0].args).toEqual({
      p_tenant: TENANT,
      p_from: new Date(window.start).toISOString(),
      p_to: new Date(window.end).toISOString(),
      p_outlet: 'branch-1',
    })
    expect(calls[1].args).toMatchObject({
      p_from: new Date(window.previousStart).toISOString(),
      p_to: new Date(window.previousEnd).toISOString(),
    })
    expect(shown.kpis.sales).toMatchObject({ current: 25_110, previous: 20_000, change: 25.6 })
    expect(shown.kpis.orders).toMatchObject({ current: 300, previous: 250 })
    expect(shown.kpis.avgOrder).toMatchObject({ current: 83.7, previous: 80 })
    // The per-bucket chart stays the Overview's.
    expect(shown.kpis.sales.series).toEqual(overview.kpis.sales.series)
  })

  test('a failed report read keeps the Overview’s own (same-definition) figures', async () => {
    const overview = await readOverview()
    const client: ReportRpcClient = { rpc: async () => ({ data: null, error: { code: '42501', message: 'no' } }) }
    expect(await withReportHeadline(overview, client, { tenantId: TENANT, outletId: null, now: NOW })).toBe(overview)
  })

  test('a bill-total Overview (Convex) never asks the report functions', async () => {
    const overview = buildOverview([], window)
    const rpc = jest.fn()
    expect(await withReportHeadline(overview, { rpc }, { tenantId: TENANT, outletId: null, now: NOW })).toBe(overview)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('applyReportHeadline with no orders shows zeros, not a division by zero', () => {
    const overview = buildOverview([], window, 'net_sales')
    const shown = applyReportHeadline(overview, { current: { netCents: 0, orders: 0 }, previous: { netCents: 0, orders: 0 } })
    expect(shown.kpis.avgOrder).toMatchObject({ current: 0, previous: 0, change: null })
  })
})

describe('the tile says what it counts', () => {
  test('net sales are labelled "Net sales" and say fees are left out', async () => {
    const tiles = buildMetricTiles({ customers: null, overview: await readOverview() })
    const sales = tiles.find((tile) => tile.key === 'sales')
    expect(sales?.label).toBe('Net sales')
    expect(sales?.hint).toMatch(/without service charge or delivery fees/)
    expect(sales?.hint).toMatch(/not paid yet count/)
  })

  test('bill totals (Convex) keep "Sales" and say fees are included', () => {
    const tiles = buildMetricTiles({ customers: null, overview: buildOverview([], window) })
    expect(tiles.find((tile) => tile.key === 'sales')).toMatchObject({ label: 'Sales', hint: expect.stringMatching(/included/) })
  })
})

describe('the dashboard windows are the reports’ windows', () => {
  const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2000-01-01', cutoffMinutes: 240 }]

  test.each([
    ['7d', 'last_7_days'],
    ['30d', 'last_30_days'],
  ] as const)('%s = Reports "%s" (midnight and a 4 AM cutoff)', (range, preset) => {
    for (const schedule of [[], FOUR_AM] satisfies CutoffSchedule[]) {
      const dashboard = resolveDashboardWindow(range, NOW, schedule)
      const report = resolveReportPeriod({ preset }, NOW, schedule)
      if (!report.ok) throw new Error(report.error)
      expect({ start: dashboard.start, end: dashboard.end }).toEqual({ start: report.period.start, end: report.period.end })
    }
  })

  test('a week is seven business days ending now', () => {
    expect(window.end).toBe(NOW)
    expect(window.end - window.start).toBe(6 * DAY_MS + 14 * HOUR_MS)
  })
})
