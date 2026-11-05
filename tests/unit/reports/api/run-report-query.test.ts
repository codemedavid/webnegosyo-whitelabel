import { runReportQuery } from '@/lib/reports/api/run-report-query'
import { reportQuerySchema, toReportSearchRecord } from '@/lib/reports/api/query-schema'
import { buildReportContext } from '@/lib/reports/read/report-context'
import type { ReportRpcClient } from '@/lib/reports/read/report-rpc'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
// Wed 2026-10-14 15:30 Manila.
const NOW = Date.parse('2026-10-14T07:30:00Z')
const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null }

function context(searchParams: Record<string, string>) {
  const state = buildReportContext({
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: false },
    backend: 'platform',
    appUser: owner,
    outlets: [],
    searchParams,
    now: NOW,
  })
  if (state.kind !== 'ready') throw new Error(state.kind)
  return state.context
}

const summaryRow = (orders: number, netCents: number) => ({
  orders,
  gross_cents: netCents,
  discount_cents: 0,
  delivery_discount_cents: 0,
  refund_cents: 0,
  net_cents: netCents,
  service_cents: 0,
  delivery_cents: 0,
  billed_cents: netCents,
  collected_cents: netCents,
  unpaid_cents: 0,
  overpaid_cents: 0,
  void_orders: 0,
  void_billed_cents: 0,
  orders_without_lines: 0,
  orders_lines_mismatch: 0,
  line_gap_cents: 0,
})

const itemRow = (key: string, quantity: number, netCents: number) => ({
  item_key: key,
  menu_item_id: key,
  label: key.toUpperCase(),
  category_label: 'Mains',
  orders: quantity,
  quantity,
  gross_cents: netCents,
  discount_cents: 0,
  net_cents: netCents,
  is_unrecorded: false,
})

/** Current window = the later p_from; the compared window gets smaller numbers. */
function fakeClient(currentFrom: string): { client: ReportRpcClient; calls: string[] } {
  const calls: string[] = []
  const client: ReportRpcClient = {
    rpc: (fn, args) => {
      calls.push(fn)
      const isCurrent = String(args.p_from) >= currentFrom
      switch (fn) {
        case 'report_sales_summary':
          return Promise.resolve({ data: [isCurrent ? summaryRow(30, 900_000) : summaryRow(20, 500_000)], error: null })
        case 'report_sales_by_item':
          return Promise.resolve({
            data: isCurrent ? [itemRow('a', 60, 600_000), itemRow('b', 30, 300_000)] : [itemRow('a', 40, 500_000)],
            error: null,
          })
        case 'report_sales_by_period':
          return Promise.resolve({
            data: [{ bucket: isCurrent ? '2026-10-12' : '2026-10-05', orders: 3, gross_cents: 300, discount_cents: 0, net_cents: 300, billed_cents: 300, collected_cents: 300 }],
            error: null,
          })
        case 'report_profit_summary':
        case 'report_expenses_by_category':
        case 'report_profit_by_period':
          return Promise.resolve({ data: null, error: { code: '42501', message: 'costs' } })
        default:
          return Promise.resolve({ data: [], error: null })
      }
    },
  }
  return { client, calls }
}

describe('runReportQuery', () => {
  test('a summary with items: per-day averages, items sold, and the compared week', async () => {
    const ctx = context({ period: 'this_week' })
    const { client } = fakeClient(new Date(ctx.period.start).toISOString())
    const sections = await runReportQuery({ context: ctx, client, sections: ['summary', 'items'] })
    expect(sections.summary).toEqual({
      ok: true,
      data: expect.objectContaining({
        days: 3,
        values: expect.objectContaining({ net_sales: 900_000, orders: 30, items_sold: 90, avg_orders_per_day: 10, avg_sales_per_day: 300_000 }),
        previous: expect.objectContaining({ net_sales: 500_000, items_sold: 40 }),
      }),
    })
    expect(sections.items?.ok && sections.items.data.rows).toEqual([
      expect.objectContaining({ key: 'a', label: 'A', categoryLabel: 'Mains', values: expect.objectContaining({ share_of_sales: 600_000 / 900_000 }), previous: expect.objectContaining({ net_sales: 500_000 }) }),
      expect.objectContaining({ key: 'b', previous: null }),
    ])
    expect(sections).not.toHaveProperty('periods')
  })

  test('periods are zero-filled and paired with the compared period bucket by bucket', async () => {
    const ctx = context({ period: 'this_week' })
    const { client } = fakeClient(new Date(ctx.period.start).toISOString())
    const sections = await runReportQuery({ context: ctx, client, sections: ['periods'] })
    expect(sections.periods?.ok && sections.periods.data).toEqual({
      grain: 'day',
      rows: [
        expect.objectContaining({ key: '2026-10-12', label: 'Oct 12', values: expect.objectContaining({ net_sales: 300 }), previous: expect.objectContaining({ net_sales: 300 }) }),
        expect.objectContaining({ key: '2026-10-13', values: expect.objectContaining({ net_sales: 0 }), previous: expect.objectContaining({ net_sales: 0 }) }),
        expect.objectContaining({ key: '2026-10-14' }),
      ],
    })
  })

  test('without comparison nothing is read twice and rows carry no previous', async () => {
    const ctx = context({ period: 'this_week', compare: '0' })
    const { client, calls } = fakeClient(new Date(ctx.period.start).toISOString())
    const sections = await runReportQuery({ context: ctx, client, sections: ['summary', 'items'] })
    expect([...calls].sort()).toEqual(['report_sales_by_item', 'report_sales_summary'])
    expect(sections.summary?.ok && sections.summary.data.previous).toBeNull()
    expect(sections.items?.ok && sections.items.data.rows[0]).not.toHaveProperty('previous')
  })

  test('a refused profit section says so without failing the rest', async () => {
    const ctx = context({ period: 'this_week' })
    const { client } = fakeClient(new Date(ctx.period.start).toISOString())
    const sections = await runReportQuery({ context: ctx, client, sections: ['summary', 'profit'] })
    expect(sections.summary?.ok).toBe(true)
    expect(sections.profit).toEqual({ ok: false, error: expect.objectContaining({ kind: 'forbidden' }) })
  })

  test('hour bars are refused for a long period and fall back to its own grain', async () => {
    const ctx = context({ period: 'last_30_days' })
    const { client } = fakeClient(new Date(ctx.period.start).toISOString())
    const sections = await runReportQuery({ context: ctx, client, sections: ['periods'], grain: 'hour' })
    expect(sections.periods?.ok && sections.periods.data.grain).toBe('day')
  })
})

describe('reportQuerySchema', () => {
  test('accepts a query and turns it into the report context’s URL parameters', () => {
    const query = reportQuerySchema.parse({ tenantId: TENANT, period: { preset: 'this_year' }, compare: 'last_year', sections: ['summary', 'summary', 'periods'] })
    expect(query.sections).toEqual(['summary', 'periods'])
    expect(toReportSearchRecord(query)).toEqual({ period: 'this_year', compare: 'year' })
  })

  test('refuses unknown fields, sections and too many sections', () => {
    expect(reportQuerySchema.safeParse({ tenantId: TENANT, period: { preset: 'today' }, sections: ['summary'], extra: 1 }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ tenantId: TENANT, period: { preset: 'today' }, sections: ['everything'] }).success).toBe(false)
    expect(
      reportQuerySchema.safeParse({ tenantId: TENANT, period: { preset: 'today' }, sections: ['summary', 'periods', 'items', 'categories', 'payments', 'channels', 'hours'] }).success,
    ).toBe(false)
    expect(reportQuerySchema.safeParse({ tenantId: 'not-a-uuid', period: { preset: 'today' }, sections: ['summary'] }).success).toBe(false)
  })
})
