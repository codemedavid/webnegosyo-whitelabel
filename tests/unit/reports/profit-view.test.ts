import { resolveReportPeriod, type ReportPeriod } from '@/lib/reports/period'
import type { ProfitFinding } from '@/lib/reports/profit-model'
import { canSeeProfit, expensesBookHref, expensesLinkFor, findingCopy, parseProfitView, previousFullWindow, profitGrainFor } from '@/lib/reports/profit-view'
import { PROFIT_FORBIDDEN_MESSAGE, readExpenseCategories, readProfitPeriods, readProfitSummary, type ReportRpcClient } from '@/lib/reports/read/report-rpc'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const NOW = Date.parse('2026-10-21T04:00:00Z') // Wed Oct 21, noon Manila

const staff = (permissions: string[] | null, extra: Partial<{ outlet_id: string | null; tenant_id: string; role: string; is_owner: boolean }> = {}) => ({
  role: 'admin',
  tenant_id: TENANT,
  is_owner: false,
  permissions,
  outlet_id: null,
  ...extra,
})

function period(preset: Parameters<typeof resolveReportPeriod>[0]): ReportPeriod {
  const result = resolveReportPeriod(preset, NOW)
  if (!result.ok) throw new Error(result.error)
  return result.period
}

describe('who sees profit', () => {
  test.each([
    ['the owner', staff([], { is_owner: true }), true],
    ['legacy full access (NULL permissions)', staff(null), true],
    ['reports + expenses + costs', staff(['reports', 'expenses', 'costs']), true],
    ['a branch manager with all three', staff(['reports', 'expenses', 'costs'], { outlet_id: 'b1' }), true],
    ['reports only', staff(['reports']), false],
    ['without costs', staff(['reports', 'expenses']), false],
    ['without expenses', staff(['reports', 'costs']), false],
    ['another store’s owner', staff([], { is_owner: true, tenant_id: 'other' }), false],
    ['a superadmin (cannot read the expense book)', staff(null, { role: 'superadmin' }), false],
  ])('%s', (_name, appUser, expected) => {
    expect(canSeeProfit(appUser as never, TENANT)).toBe(expected)
  })

  test('no account is no profit', () => {
    expect(canSeeProfit(null, TENANT)).toBe(false)
  })
})

describe('windows', () => {
  test('a month is compared with the whole previous calendar month', () => {
    const window = previousFullWindow(period({ preset: 'this_month' }))
    expect(window).toEqual({ start: Date.parse('2026-08-31T16:00:00Z'), end: Date.parse('2026-09-30T16:00:00Z') })
  })

  test('January looks back to December', () => {
    const january = resolveReportPeriod({ preset: 'this_month' }, Date.parse('2027-01-10T04:00:00Z'))
    if (!january.ok) throw new Error(january.error)
    expect(previousFullWindow(january.period)?.start).toBe(Date.parse('2026-11-30T16:00:00Z'))
  })

  test('a window shorter than a month never looks back for missing bills (rent is monthly)', () => {
    expect(previousFullWindow(period({ preset: 'this_week' }))).toBeNull()
    expect(previousFullWindow(period({ preset: 'last_week' }))).toBeNull()
    expect(previousFullWindow(period({ preset: 'today' }))).toBeNull()
  })

  test('a custom window of a month or more is compared with the same length before', () => {
    const custom = resolveReportPeriod({ preset: 'custom', from: '2026-08-01', to: '2026-09-30' }, NOW)
    if (!custom.ok) throw new Error(custom.error)
    const window = previousFullWindow(custom.period)
    expect(window?.end).toBe(custom.period.start)
    expect(window && window.end - window.start).toBe(custom.period.fullEnd - custom.period.start)
  })

  test('the trend is never finer than a day', () => {
    expect(profitGrainFor('hour')).toBe('day')
    expect(profitGrainFor('week')).toBe('week')
  })

  test('only "cash" opens the cash flow view', () => {
    expect(parseProfitView('cash')).toBe('cash')
    expect(parseProfitView(['cash'])).toBe('cash')
    expect(parseProfitView('anything')).toBe('profit')
    expect(parseProfitView(undefined)).toBe('profit')
  })
})

describe('links into the expense book keep the period', () => {
  test('the current period opens this month and dates a new entry today', () => {
    expect(expensesLinkFor(period({ preset: 'this_week' }))).toEqual({ month: '2026-10', recordOn: '2026-10-21' })
  })

  test('a past period opens its own month and dates a new entry on its last day', () => {
    expect(expensesLinkFor(period({ preset: 'last_month' }))).toEqual({ month: '2026-09', recordOn: '2026-09-30' })
  })

  test('hrefs carry the month, then the screen’s own parameters', () => {
    const link = { month: '2026-09', recordOn: '2026-09-30' }
    expect(expensesBookHref('/shop/admin', link)).toBe('/shop/admin/expenses?month=2026-09')
    expect(expensesBookHref('/shop/admin', link, { category: 'c 1' })).toBe('/shop/admin/expenses?month=2026-09&category=c+1')
  })
})

describe('the trust strip says what to do', () => {
  const links = { adminBase: '/shop/admin', periodPhrase: 'in September', expenses: { month: '2026-09', recordOn: '2026-09-30' } }
  const copy = (finding: ProfitFinding) => findingCopy(finding, links)

  test('a missing bill opens the viewed month with that category ready, dated inside the period', () => {
    const row = copy({ kind: 'missing_recurring', severity: 'warning', categoryId: 'c-rent', categoryName: 'Rent (Upa)', systemKey: 'rent', previousCents: 1 })
    expect(row.text).toBe('No Rent (Upa) recorded in September. Profit looks higher than it is.')
    expect(row.action).toEqual({ label: 'Record', href: '/shop/admin/expenses?month=2026-09&add=c-rent&on=2026-09-30' })
  })

  test('missing recipes go to the menu, unsorted pay-outs to the unsorted view of the month', () => {
    expect(copy({ kind: 'uncosted_dishes', severity: 'warning', uncostedDishes: 9, uncostedShare: 0.25 }).action?.href).toBe('/shop/admin/menu')
    const payouts = copy({ kind: 'unsorted_payouts', severity: 'warning', count: 4, cents: 120_000 })
    expect(payouts.text).toBe('4 drawer pay-outs (₱1,200) not sorted yet, so not in Expenses.')
    expect(payouts.action?.href).toBe('/shop/admin/expenses?month=2026-09&view=unsorted')
    expect(copy({ kind: 'no_expenses', severity: 'warning' }).action?.href).toBe('/shop/admin/expenses?month=2026-09&add=1&on=2026-09-30')
  })

  test('notes about how the figure was made carry no action', () => {
    expect(copy({ kind: 'ingredient_estimate', severity: 'info' })).toMatchObject({ tone: 'info', action: null })
  })
})

describe('profit reads', () => {
  const WINDOW = { tenantId: TENANT, start: Date.parse('2026-10-11T16:00:00Z'), end: Date.parse('2026-10-12T16:00:00Z'), branch: { p_outlet: 'b1', p_unassigned: false } }
  const client = (reply: { data: unknown; error: { code?: string; message: string } | null }) => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const rpc: ReportRpcClient = { rpc: async (fn, args) => (calls.push([fn, args]), reply) }
    return { rpc, calls }
  }

  test('a refusal says to ask the owner for cost access', async () => {
    const { rpc } = client({ data: null, error: { code: '42501', message: 'Profit needs the Expenses and Costs permissions.' } })
    const result = await readProfitSummary(rpc, WINDOW)
    expect(result).toEqual({ ok: false, error: { kind: 'forbidden', message: PROFIT_FORBIDDEN_MESSAGE } })
  })

  test('the branch and grain travel as arguments; rows are mapped and sorted', async () => {
    const row = {
      bucket: '2026-10-12', orders: 1, net_sales_cents: 100, collected_cents: 100, sale_movements: 0, ledger_cogs_cents: 0, fallback_cogs_cents: 0,
      waste_cents: 0, count_variance_cents: 0, ingredient_direct_cents: 0, ingredient_stock_cents: 0, expenses_cents: 0, cash_out_cents: 0,
    }
    const { rpc, calls } = client({ data: [{ ...row, bucket: '2026-10-13' }, row], error: null })
    const result = await readProfitPeriods(rpc, WINDOW, 'day')
    expect(calls[0]).toEqual(['report_profit_by_period', expect.objectContaining({ p_outlet: 'b1', p_grain: 'day', p_tenant: TENANT })])
    expect(result.ok && result.data.map((period) => period.bucket)).toEqual(['2026-10-12', '2026-10-13'])
  })

  test('a malformed row fails the card instead of reading as ₱0', async () => {
    const { rpc } = client({ data: [{ category_id: 'c', name: 'Rent', icon: null, category_group: 'rent', system_key: null, cents: 1, stock_purchase_cents: 0, expenses: 1 }], error: null })
    const result = await readExpenseCategories(rpc, WINDOW)
    expect(result.ok).toBe(false)
  })
})
