/** @jest-environment node */
import { createRefBook } from '@/lib/assistant/refs'
import type { AdminDashboardData } from '@/lib/dashboard/load-admin-dashboard'
import { resolveWhen, type ResolvedWhen } from '@/lib/assistant/insights/when'

// Friday 2026-11-13, 2:30 PM Manila.
const NOW = Date.parse('2026-11-13T06:30:00Z')
function when(input: Parameters<typeof resolveWhen>[0]): ResolvedWhen {
  const result = resolveWhen(input, NOW)
  if (!result.ok) throw new Error(result.error)
  return result.when
}

jest.mock('server-only', () => ({}))
jest.mock('@/lib/dashboard/load-admin-dashboard', () => ({ loadAdminDashboard: jest.fn(), loadSalesForWindow: jest.fn() }))
jest.mock('@/lib/assistant/data/cutoff-schedule', () => ({ cutoffScheduleFor: jest.fn(async () => []) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

const kpi = (current: number, previous: number, change: number | null) => ({ key: 'sales', current, previous, change, series: [], previousSeries: [] })

function dashboard(overrides: Partial<AdminDashboardData> = {}): AdminDashboardData {
  return {
    range: '7d',
    compareLabel: 'previous 7 days',
    generatedAt: 0,
    notes: [],
    failed: false,
    growth: null,
    overview: {
      basis: 'net_sales',
      bounds: { start: 0, end: 0, previousStart: 0, previousEnd: 0 },
      labels: [],
      kpis: { sales: kpi(12000, 10000, 20), orders: kpi(40, 50, -20), avgOrder: kpi(300, 200, 50), customers: kpi(30, 25, 20) } as never,
      channels: [{ key: 'online', label: 'Online menu', sales: 8000, orders: 30, share: 66.7 }],
      orderTypes: [],
      topItems: [
        { key: 'id:6f1c2b0e-0000-4000-8000-000000000001', name: 'Sisig', quantity: 20, revenue: 3600 },
        { key: 'name:mystery', name: 'Mystery', quantity: 2, revenue: 100 },
      ],
      hours: [],
      busiestHour: { hour: 19, label: '7 PM', orders: 9, sales: 2400 },
    },
    ...overrides,
  }
}

describe('get_sales_overview result', () => {
  test('gives the model KPIs and refs, never raw ids, and the card the formatted numbers', async () => {
    const { buildSalesOverviewResult } = await import('@/lib/assistant/tools/reads/sales-overview')
    const refs = createRefBook({})

    const result = buildSalesOverviewResult(dashboard(), when({ period: 'last_7_days' }), refs)

    expect(JSON.stringify(result.facts)).not.toMatch(/6f1c2b0e/)
    expect(result.facts.topItems).toEqual([
      { ref: 'i1', name: 'Sisig', qty: 20, revenue: 3600 },
      { ref: null, name: 'Mystery', qty: 2, revenue: 100 },
    ])
    expect(refs.resolve('i1', 'item')).toBe('6f1c2b0e-0000-4000-8000-000000000001')
    expect(result.card?.type).toBe('stats')
    expect(result.facts.channels).toEqual([{ label: 'Online menu', sharePct: 67 }])
  })

  test('reports a failed read as unavailable, never as zero sales', async () => {
    const { buildSalesOverviewResult } = await import('@/lib/assistant/tools/reads/sales-overview')

    const result = buildSalesOverviewResult(dashboard({ failed: true, overview: null, notes: ['This store is on Convex but its credentials are missing.'] }), when({ period: 'last_7_days' }), createRefBook({}))

    expect(result.facts).toEqual({ available: false, reason: 'This store is on Convex but its credentials are missing.' })
    expect(result.card).toBeUndefined()
  })
})

describe('get_sales_overview for any point in time', () => {
  afterEach(() => jest.useRealTimers())

  test('yesterday reads exactly yesterday and the same day last week, and says which day it was', async () => {
    jest.useFakeTimers({ now: NOW })
    const { loadSalesForWindow } = jest.requireMock('@/lib/dashboard/load-admin-dashboard') as { loadSalesForWindow: jest.Mock }
    loadSalesForWindow.mockResolvedValue(
      dashboard({ compareLabel: 'the same day last week', overview: { ...dashboard().overview!, hours: [
        { hour: 0, label: '12 AM', orders: 0, sales: 0 },
        { hour: 15, label: '3 PM', orders: 4, sales: 1200 },
      ] } }),
    )
    const { getSalesOverviewTool } = await import('@/lib/assistant/tools/reads/sales-overview')
    const { createTurnMemo } = await import('@/lib/assistant/tools/registry')

    const result = await getSalesOverviewTool.run(
      { tenantId: 't1', refs: createRefBook({}), memo: createTurnMemo() } as never,
      getSalesOverviewTool.input.parse({ period: 'yesterday' }),
    )

    const yesterday = Date.parse('2026-11-12T00:00:00+08:00')
    expect(loadSalesForWindow).toHaveBeenCalledWith('t1', {
      start: yesterday,
      end: yesterday + 86_400_000,
      previousStart: yesterday - 7 * 86_400_000,
      previousEnd: yesterday - 6 * 86_400_000,
      dayCount: 1,
      outletId: null,
      compareLabel: 'the same day last week',
    })
    expect(result.facts).toMatchObject({ period: 'Yesterday', dates: '2026-11-12', comparedWith: 'the same day last week', byHour: [{ hour: '3 PM', orders: 4, sales: 1200 }] })
    expect(result.facts.soFar).toBeUndefined()
    expect(result.card).toMatchObject({ title: 'Sales — Yesterday' })
  })

  test('a date that has not happened is refused before anything is read', async () => {
    jest.useFakeTimers({ now: NOW })
    const { loadSalesForWindow } = jest.requireMock('@/lib/dashboard/load-admin-dashboard') as { loadSalesForWindow: jest.Mock }
    loadSalesForWindow.mockClear()
    const { getSalesOverviewTool } = await import('@/lib/assistant/tools/reads/sales-overview')
    const { createTurnMemo } = await import('@/lib/assistant/tools/registry')

    const result = await getSalesOverviewTool.run(
      { tenantId: 't1', refs: createRefBook({}), memo: createTurnMemo() } as never,
      getSalesOverviewTool.input.parse({ from: '2026-12-01' }),
    )

    expect(result.facts).toEqual({ available: false, reason: "The end date can't be in the future." })
    expect(loadSalesForWindow).not.toHaveBeenCalled()
  })
})

describe('search_menu', () => {
  const MENU = [
    { id: 'a', name: 'Crispy Sisig', price: 180, isAvailable: true, categoryId: null, categoryName: 'Mains', createdAt: null },
    { id: 'b', name: 'Café Latte', price: 120, isAvailable: false, categoryId: null, categoryName: 'Drinks', createdAt: null },
  ]

  test('matches every word, ignoring case and accents', async () => {
    const { searchMenu } = await import('@/lib/assistant/tools/reads/search-menu')

    expect(searchMenu(MENU, 'cafe').map((m) => m.id)).toEqual(['b'])
    expect(searchMenu(MENU, 'sisig crispy').map((m) => m.id)).toEqual(['a'])
    expect(searchMenu(MENU, 'drinks').map((m) => m.id)).toEqual(['b'])
  })

  test('flags out-of-stock dishes for the model', async () => {
    const { buildSearchMenuResult } = await import('@/lib/assistant/tools/reads/search-menu')

    const result = buildSearchMenuResult(MENU, createRefBook({}))

    expect(result.facts.items).toEqual([
      { ref: 'i1', name: 'Crispy Sisig', price: 180, category: 'Mains' },
      { ref: 'i2', name: 'Café Latte', price: 120, category: 'Drinks', outOfStock: true },
    ])
  })
})
