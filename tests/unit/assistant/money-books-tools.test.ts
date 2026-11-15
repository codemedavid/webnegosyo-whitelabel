/** @jest-environment node */
/**
 * get_shifts and get_profit: what reaches the model and the card, built from
 * the export engine's own sheets (so the catalogue's column ids are the contract).
 */
import { resolveWhen, type ResolvedWhen } from '@/lib/assistant/insights/when'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { buildProfitResult, buildShiftsResult, getProfitTool, getShiftsTool, sheetRows } from '@/lib/assistant/tools/reads/money-books'
import { availableTools, factsForModel } from '@/lib/assistant/tools/registry'
import { EXPORT_SHEETS, visibleColumns, type SheetId } from '@/lib/exports/catalogue'
import { NO_FOOD_COST_NOTE, PROFIT_LINES } from '@/lib/exports/read/book-read'
import type { ExportResult } from '@/lib/exports/run-export'
import type { BuiltSheet, ExportRow } from '@/lib/exports/types'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

// Friday 2026-11-13, 2:30 PM Manila.
const NOW = Date.parse('2026-11-13T06:30:00Z')
const everything = { has: () => true }

function when(input: Parameters<typeof resolveWhen>[0]): ResolvedWhen {
  const resolved = resolveWhen(input, NOW)
  if (!resolved.ok) throw new Error(resolved.error)
  return resolved.when
}

/** A sheet as the engine builds it: the catalogue's columns, rows projected onto them. */
function built(id: SheetId, rows: ExportRow[]): BuiltSheet {
  const sheet = EXPORT_SHEETS[id]
  const columns = visibleColumns(sheet, everything)
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.some((column) => column.id === key)) throw new Error(`${id} has no column ${key}`)
  return { id, name: sheet.name, columns, rows: rows.map((row) => columns.map((column) => row[column.id] ?? null)), notes: [] }
}

function result(...sheets: BuiltSheet[]): ExportResult {
  return { header: { storeName: 'Shop', periodLabel: 'x', branchLabel: 'Whole store', asOf: 'now' }, sheets, leftOut: [] }
}

const SHIFT_ID = '55555555-5555-4555-8555-555555555555'
const shift = (overrides: ExportRow): ExportRow => ({
  business_day: '2026-11-12',
  branch: null,
  cashier: 'Ana Cruz',
  drawer: 'Front',
  opened: '2026-11-12 08:00',
  closed: '2026-11-12 17:00',
  hours: 9,
  close_kind: 'Counted',
  expected: 5000,
  first_count: 5000,
  final_count: 5000,
  difference: 0,
  remittance: 'accepted',
  shift_id: SHIFT_ID,
  ...overrides,
})

describe('get_shifts', () => {
  const books = result(
    built('shifts', [
      shift({}),
      shift({ cashier: 'ben@shop.example.com', opened: '2026-11-12 17:00', closed: '2026-11-12 23:00', expected: 3200.5, final_count: 3150.5, difference: -50 }),
      shift({ cashier: 'Carla', business_day: '2026-11-13', opened: '2026-11-13 08:00', closed: 'Still open', hours: null, close_kind: null, expected: null, first_count: null, final_count: null, difference: null, remittance: null }),
      shift({ cashier: 'Dan', business_day: '2026-11-11', opened: '2026-11-11 08:00', closed: '2026-11-11 17:00', expected: 1000, final_count: 1020, difference: 20 }),
    ]),
    built('cash_moves', [
      { date: '2026-11-12', time: '09:00', kind: 'Cash paid out', amount: -250, reason: 'Ice', recorded_by: 'Ana Cruz', shift_id: SHIFT_ID },
      { date: '2026-11-12', time: '10:00', kind: 'Cash put in', amount: 500, reason: 'Change fund', recorded_by: 'Ana Cruz', shift_id: SHIFT_ID },
      { date: '2026-11-12', time: '12:00', kind: 'Cash paid out', amount: -80.5, reason: 'x'.repeat(200), recorded_by: 'ben@shop.example.com', shift_id: SHIFT_ID },
    ]),
  )
  const cashiers = result(
    built('sales_by_cashier', [
      { cashier: 'Ana Cruz', orders: 30, gross: 9000, discounts: 200, net: 8800, aov: 293.33, collected: 8800, unpaid: 0, cancelled: 1, share: 0.7 },
      { cashier: 'ben@shop.example.com', orders: 12, gross: 3800, discounts: 0, net: 3800, aov: 316.67, collected: 3800, unpaid: 0, cancelled: 0, share: 0.3 },
    ]),
  )
  const answer = buildShiftsResult(books, cashiers, when({ period: 'last_7_days' }))
  const facts = factsForModel(answer) as Record<string, never>

  it('adds up over and short from the counted shifts only', () => {
    expect(facts).toMatchObject({ available: true, shifts: 4, stillOpen: 1, counted: 3, shortTotal: -50, overTotal: 20, netOverShort: -30 })
  })

  it('lists the biggest gaps first, with staff emails cut to a label and no shift id', () => {
    const list = facts.list as { cashier: string; overShort: number | null; closed: string }[]
    expect(list.map((entry) => entry.cashier)).toEqual(['ben (shop)', 'Dan', 'Carla', 'Ana Cruz'])
    expect(list[0]).toMatchObject({ overShort: -50, expected: 3200.5, counted: 3150.5, day: '2026-11-12' })
    expect(list[2]).toMatchObject({ closed: 'Still open', overShort: null })
    const sent = JSON.stringify(facts)
    expect(sent).not.toContain(SHIFT_ID)
    expect(sent).not.toContain('@')
    expect(sent).not.toContain('isOpen')
  })

  it('totals cash in and out by kind and clips a typed reason', () => {
    const cash = facts.cashInOut as { count: number; byKind: Record<string, number>; largest: { reason?: string; amount: number; by: string }[] }
    expect(cash.count).toBe(3)
    expect(cash.byKind).toEqual({ 'Cash paid out': -330.5, 'Cash put in': 500 })
    expect(cash.largest.map((move) => move.amount)).toEqual([500, -250, -80.5])
    expect(cash.largest[2].reason).toHaveLength(80)
    expect(cash.largest[2].by).toBe('ben (shop)')
  })

  it('reports sales per cashier from the Sales by cashier sheet', () => {
    expect(facts.salesByCashier).toEqual([
      { cashier: 'Ana Cruz', orders: 30, sales: 8800, discounts: 200, cancelled: 1 },
      { cashier: 'ben (shop)', orders: 12, sales: 3800, discounts: 0, cancelled: 0 },
    ])
  })

  it('draws one row per listed shift, saying short, over, exact or still open', () => {
    if (answer.card?.type !== 'ranked') throw new Error('expected a ranked card')
    expect(answer.card.subtitle).toBe('₱30 short in all · 4 shifts')
    expect(answer.card.rows.map((row) => row.value)).toEqual(['₱50 short', '₱20 over', 'Still open', 'Exact'])
    expect(answer.card.rows[0]).toMatchObject({ label: 'ben (shop) · 2026-11-12', badge: 'Short', detail: 'Expected ₱3,200.50 · counted ₱3,150.50' })
    expect(answer.card.rows[2].detail).toBeUndefined()
    expect(answer.links).toEqual([{ label: 'Open Cash', path: '/cash' }])
  })

  it('says so when nothing happened, and when sales per cashier was not read for a long range', () => {
    const empty = buildShiftsResult(result(built('shifts', []), built('cash_moves', [])), null, when({ period: 'yesterday' }))
    expect(empty.facts).toMatchObject({ available: true, shifts: 0 })
    expect(empty.card).toMatchObject({ type: 'ranked', rows: [] })
    const long = buildShiftsResult(books, null, when({ period: 'last_90_days' }))
    expect(long.facts.salesByCashier).toBeUndefined()
    expect(long.facts.salesByCashierNote).toMatch(/31 days or less/)
  })

  it('caps the list and says how many shifts there were', () => {
    const many = result(built('shifts', Array.from({ length: 14 }, (_, index) => shift({ difference: -index, opened: `2026-11-12 ${String(index).padStart(2, '0')}:00` }))), built('cash_moves', []))
    const capped = buildShiftsResult(many, null, when({ period: 'last_7_days' }))
    expect((capped.facts.list as unknown[]).length).toBe(10)
    expect(capped.facts.listNote).toBe('The 10 shifts with the biggest gaps, of 14.')
    expect(capped.facts.shortTotal).toBe(-91)
  })
})

describe('get_profit', () => {
  const line = (label: string, value: number | null, share: number | null, note: string | null = null): ExportRow => ({ line: label, value, share, note })
  const statement = result(
    built('profit', [
      { line: PROFIT_LINES.orders, value: { value: 420, kind: 'count' }, share: null, note: 'Cancelled orders are not counted' },
      line(PROFIT_LINES.sales, 100000, 1, 'Food and drinks after discounts; no service charge or delivery fee'),
      line(PROFIT_LINES.ingredients, 35000, 0.35, 'From what was sold'),
      line(PROFIT_LINES.gross, 65000, 0.65),
      line(PROFIT_LINES.expensesHeading, null, null),
      line('  People', 20000, 0.2),
      line('  Place', 15000, 0.15),
      line(PROFIT_LINES.expenses, 35000, 0.35),
      line(PROFIT_LINES.profit, 30000, 0.3, 'Gross profit less total expenses'),
      line(PROFIT_LINES.categoriesHeading, null, null),
      line('  Salaries', 20000, 0.2, 'People'),
      line('  Rent', 12000, 0.12, 'Place'),
      line('  Profit', 3000, 0.03, 'Place'),
      line(PROFIT_LINES.capex, 8000, 0.08, 'Money out, but not an expense of this period'),
    ]),
  )
  const answer = buildProfitResult(statement, when({ period: 'last_month' }))

  it('reads the statement by its fixed lines, never a category that shares a name', () => {
    expect(answer.facts).toMatchObject({
      available: true,
      orders: 420,
      sales: { amount: 100000 },
      costOfIngredients: { amount: 35000, sharePct: 35, basis: 'From what was sold' },
      grossProfit: { amount: 65000, sharePct: 65 },
      expenses: { amount: 35000, sharePct: 35 },
      profit: { amount: 30000, sharePct: 30 },
      equipmentBought: { amount: 8000 },
    })
  })

  it('keeps expense groups and categories apart, biggest category first', () => {
    expect(answer.facts.expenseGroups).toEqual([
      { name: 'People', amount: 20000, sharePct: 20 },
      { name: 'Place', amount: 15000, sharePct: 15 },
    ])
    expect(answer.facts.topExpenseCategories).toEqual([
      { name: 'Salaries', amount: 20000, sharePct: 20 },
      { name: 'Rent', amount: 12000, sharePct: 12 },
      { name: 'Profit', amount: 3000, sharePct: 3 },
    ])
  })

  it('shows sales, ingredients, expenses and profit on the card', () => {
    if (answer.card?.type !== 'stats') throw new Error('expected a stats card')
    expect(answer.card.items).toEqual([
      { label: 'Sales', value: '₱100,000' },
      { label: 'Ingredients', value: '₱35,000', hint: '35% of sales' },
      { label: 'Expenses', value: '₱35,000', hint: '35% of sales' },
      { label: 'Profit', value: '₱30,000', hint: '30% of sales' },
    ])
    expect(answer.links).toEqual([{ label: 'Open Profit', path: '/reports/profit' }])
  })

  it('passes on a blank gross profit (no food cost recorded) instead of a 100% margin', () => {
    const uncosted = buildProfitResult(
      result(
        built('profit', [
          line(PROFIT_LINES.sales, 50000, 1),
          line(PROFIT_LINES.ingredients, 0, 0),
          line(PROFIT_LINES.gross, null, null, NO_FOOD_COST_NOTE),
          line(PROFIT_LINES.expenses, 10000, 0.2),
          line(PROFIT_LINES.profit, 40000, 0.8),
        ]),
      ),
      when({ period: 'last_month' }),
    )
    expect(uncosted.facts.grossProfit).toEqual({ amount: null, sharePct: null, note: NO_FOOD_COST_NOTE })
  })

  it('does not guess when the statement has no totals', () => {
    expect(buildProfitResult(result(built('profit', [line('Something else', 1, null)])), when({ period: 'last_month' })).facts).toMatchObject({ available: false })
    expect(sheetRows(result(), 'profit')).toEqual([])
  })
})

describe('who gets the tools', () => {
  const flags = { inventoryEnabled: false, customerHubOn: false, menuEngineeringEnabled: false, isPlatformOrders: true }
  const staff = (permissions: string[]) => ({ role: 'admin', tenant_id: 't', is_owner: false, permissions, outlet_id: null }) as never
  const names = (caller: never, tenantFlags = flags) => availableTools(ASSISTANT_TOOLS, caller, tenantFlags).map((tool) => tool.name)

  it('shifts need the cash key, profit the costs key, both a store on the main database', () => {
    expect(names(staff(['assistant', 'reports', 'cash_manage']))).toContain('get_shifts')
    expect(names(staff(['assistant', 'reports', 'cash_manage']))).not.toContain('get_profit')
    expect(names(staff(['assistant', 'reports', 'costs', 'expenses']))).toContain('get_profit')
    expect(names(staff(['assistant', 'reports', 'orders', 'pos']))).not.toEqual(expect.arrayContaining(['get_shifts']))
    expect(names(staff(['assistant', 'cash_manage', 'costs']), { ...flags, isPlatformOrders: false })).not.toEqual(expect.arrayContaining(['get_shifts', 'get_profit']))
  })

  it('take dates only, and default to a week of shifts and this month of profit', () => {
    expect(getShiftsTool.input.safeParse({ period: 'yesterday' }).success).toBe(true)
    expect(getProfitTool.input.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(true)
    expect(getProfitTool.input.safeParse({ from: 'October' }).success).toBe(false)
    expect(getShiftsTool.description).toMatch(/Default last 7 days/)
    expect(getProfitTool.description).toMatch(/Default this month/)
  })
})
