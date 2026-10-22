import { lineCostCents, movementCostCents, parseDecimal, productCents } from '@/lib/reports/cogs'
import {
  expensesByCategory,
  manilaDayOnOrAfter,
  profitFigures,
  type ProfitCategory,
  type ProfitExpense,
  type ProfitRawInput,
} from '@/lib/reports/profit-facts'
import { buildProfitReport, missingRecurring, profitTrend } from '@/lib/reports/profit-model'
import { line, order } from './report-fixtures'

const START = Date.parse('2026-09-30T16:00:00.000Z') // Oct 1, 00:00 Manila
const END = Date.parse('2026-10-31T16:00:00.000Z') // Nov 1, 00:00 Manila
const AT = START + 12 * 60 * 60 * 1000

const CATEGORIES: ProfitCategory[] = [
  { id: 'ing', name: 'Ingredients (Palengke)', icon: 'IN', group: 'ingredients', systemKey: 'ingredients' },
  { id: 'ice', name: 'Ice (Yelo)', icon: 'IC', group: 'ingredients', systemKey: 'ice' },
  { id: 'wages', name: 'Salaries & wages (Sahod)', icon: 'SW', group: 'staff', systemKey: 'wages' },
  { id: 'rent', name: 'Rent (Upa)', icon: 'RE', group: 'occupancy', systemKey: 'rent' },
  { id: 'power', name: 'Electricity (Kuryente)', icon: 'EL', group: 'utilities', systemKey: 'electricity' },
  { id: 'eq', name: 'Big purchase (equipment)', icon: 'EQ', group: 'capex', systemKey: 'equipment' },
  { id: 'draw', name: 'Owner took cash', icon: 'OW', group: 'not_expense', systemKey: 'owner_draw' },
]

const expense = (categoryId: string, amountCents: number, extra: Partial<ProfitExpense> = {}): ProfitExpense => ({
  categoryId,
  amountCents,
  spentOn: '2026-10-05',
  outletId: null,
  isStockPurchase: false,
  status: 'recorded',
  shiftCashMovementId: null,
  ...extra,
})

function raw(overrides: Partial<ProfitRawInput> = {}): ProfitRawInput {
  return {
    scope: { start: START, end: END, outletId: null, unassigned: false },
    orders: [],
    dishCosts: new Map(),
    movements: [],
    expenses: [],
    categories: CATEGORIES,
    payouts: [],
    dishCostsVisible: true,
    ...overrides,
  }
}

const reportOf = (input: ProfitRawInput) =>
  buildProfitReport({ figures: profitFigures(input), categories: expensesByCategory(input), previousCategories: null })

describe('cogs: exact centavos', () => {
  test('reads numeric text, JSON numbers and exponents exactly', () => {
    expect(parseDecimal('-12.3456')).toEqual({ units: BigInt(-123456), scale: 4 })
    expect(parseDecimal(1e-7)).toEqual({ units: BigInt(1), scale: 7 })
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal(null)).toBeNull()
  })

  test('rounds half a centavo away from zero, like SQL round()', () => {
    expect(productCents('1.0000', '0.0050')).toBe(1)
    expect(productCents('-1.0000', '0.0050')).toBe(-1)
    expect(productCents('1.0000', '0.0049')).toBe(0)
    // 0.1 × 0.2 is not 0.020000000000000004 here.
    expect(productCents('0.1', '0.2')).toBe(2)
  })

  test('a sale is a cost, its void gives exactly that back, no cost is uncosted', () => {
    expect(movementCostCents('-2.5000', '12.3456')).toBe(3086)
    expect(movementCostCents('2.5000', '12.3456')).toBe(-3086)
    expect(movementCostCents('-2.5000', null)).toBeNull()
    expect(lineCostCents('12.3450', 3)).toBe(3704)
  })
})

describe('profit: the sentence', () => {
  const sold = order({ id: 'o1', at: AT, total: 1_000, paymentStatus: 'paid', lines: [line({ id: 'l1', quantity: 2, subtotal: 1_000 })] })
  const untracked = order({ id: 'o2', at: AT, total: 500, paymentStatus: 'paid', lines: [line({ id: 'l2', menuItemId: 'd2', quantity: 1, subtotal: 500 })] })

  test('a store that tracks stock: recipes at frozen cost + losses + ingredients that did not go into stock', () => {
    const report = reportOf(
      raw({
        orders: [sold, untracked],
        dishCosts: new Map([
          ['l1', '999.0000'], // o1 is costed by its ledger, never twice
          ['l2', '120.0000'],
        ]),
        movements: [
          { reason: 'sale', quantityDelta: '-2.0000', unitCost: '150.0000', orderId: 'o1', outletId: null, at: AT },
          { reason: 'waste', quantityDelta: '-1.0000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
          { reason: 'stocktake', quantityDelta: '0.5000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
          { reason: 'receive', quantityDelta: '10.0000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
        ],
        expenses: [
          expense('ing', 50_000, { isStockPurchase: true }),
          expense('ice', 3_000),
          expense('rent', 20_000),
          expense('wages', 30_000),
          expense('eq', 900_000),
          expense('draw', 100_000),
        ],
      }),
    )
    expect(report.ingredientBasis).toBe('recipes')
    expect(report.netSalesCents).toBe(150_000)
    expect(report.ledgerCogsCents).toBe(30_000)
    expect(report.fallbackCogsCents).toBe(12_000)
    expect(report.lossesCents).toBe(4_000 - 2_000)
    expect(report.directIngredientCents).toBe(3_000)
    expect(report.ingredientCostCents).toBe(30_000 + 12_000 + 2_000 + 3_000)
    expect(report.expensesCents).toBe(50_000)
    expect(report.profitCents).toBe(150_000 - 47_000 - 50_000)
    expect(report.capexCents).toBe(900_000)
    expect(report.notExpenseCents).toBe(100_000)
    expect(report.byCategory.map((row) => row.categoryId)).toEqual(['wages', 'rent'])
    expect(report.ratios.prime).toBeCloseTo((47_000 + 30_000) / 150_000)
    expect(report.ratios.rent).toBeCloseTo(20_000 / 150_000)
    expect(report.cashFlow).toMatchObject({ inCents: 150_000, outCents: 50_000 + 3_000 + 20_000 + 30_000 + 900_000 + 100_000 })
    expect(report.coverage).toMatchObject({ soldQuantity: 3, costedQuantity: 3, costedShare: 1, fallbackOrders: 1 })
  })

  test('a store that does not track stock: what it bought, labelled an estimate', () => {
    const report = reportOf(raw({ orders: [untracked], expenses: [expense('ing', 50_000, { isStockPurchase: true }), expense('ice', 3_000)] }))
    expect(report.ingredientBasis).toBe('purchases')
    expect(report.ingredientCostCents).toBe(53_000)
    expect(report.findings.map((finding) => finding.kind)).toContain('ingredient_estimate')
  })

  test('no sales: ratios are unknown, never 0% or ∞', () => {
    const report = reportOf(raw({ expenses: [expense('rent', 1_000)] }))
    expect(report.ratios).toEqual({ profit: null, food: null, staff: null, rent: null, prime: null })
    expect(report.profitCents).toBe(-1_000)
  })

  test('voided expenses and those outside the window never count', () => {
    const report = reportOf(
      raw({
        expenses: [
          expense('rent', 1_000, { status: 'void' }),
          expense('rent', 2_000, { spentOn: '2026-09-30' }),
          expense('rent', 4_000, { spentOn: '2026-11-01' }),
          expense('rent', 8_000, { spentOn: '2026-10-31' }),
        ],
      }),
    )
    expect(report.expensesCents).toBe(8_000)
  })
})

describe('profit: the trust strip', () => {
  test('flags rent paid last period and not yet this one', () => {
    const previous = expensesByCategory(raw({ expenses: [expense('rent', 15_000), expense('power', 4_000)] }))
    const current = expensesByCategory(raw({ expenses: [expense('power', 4_100)] }))
    expect(missingRecurring(current, previous).map((finding) => finding.systemKey)).toEqual(['rent'])
  })

  test('flags dishes sold without a cost above 10%, unsorted pay-outs and an empty book', () => {
    const report = reportOf(
      raw({
        orders: [order({ id: 'o1', at: AT, total: 100, lines: [line({ id: 'l1', quantity: 9 }), line({ id: 'l2', menuItemId: 'd2', quantity: 1 })] })],
        dishCosts: new Map([['l1', '10.0000']]),
        movements: [{ reason: 'sale', quantityDelta: '-1.0000', unitCost: null, orderId: 'o1', outletId: null, at: AT }],
        payouts: [{ id: 'p1', kind: 'pay_out', amount: '120.00', outletId: null, at: AT }],
      }),
    )
    const kinds = report.findings.map((finding) => finding.kind)
    expect(kinds).toEqual(['no_expenses', 'unsorted_payouts', 'uncosted_movements'])
    expect(report.coverage.costedShare).toBeCloseTo(0.9)

    const worse = reportOf(
      raw({
        orders: [order({ id: 'o1', at: AT, total: 100, lines: [line({ id: 'l1', quantity: 8 }), line({ id: 'l2', menuItemId: 'd2', quantity: 2 })] })],
        dishCosts: new Map([['l1', '10.0000']]),
        movements: [{ reason: 'sale', quantityDelta: '-1.0000', unitCost: '1.0000', orderId: 'o1', outletId: null, at: AT }],
        expenses: [expense('rent', 1)],
      }),
    )
    expect(worse.findings).toEqual([{ kind: 'uncosted_dishes', severity: 'warning', uncostedDishes: 1, uncostedShare: expect.closeTo(0.2) }])
  })

  test('a pay-out sorted into an expense is never unsorted, even once voided; its pay_in correction is not money in or out', () => {
    const report = reportOf(
      raw({
        expenses: [expense('rent', 12_000), expense('ice', 12_000, { status: 'void', shiftCashMovementId: 'p1' })],
        payouts: [
          { id: 'p1', kind: 'pay_out', amount: '120.00', outletId: null, at: AT },
          { id: 'pi1', kind: 'pay_in', amount: '120.00', outletId: null, at: AT + 60_000 },
          { id: 'c1', kind: 'collect', amount: '500.00', outletId: null, at: AT },
        ],
      }),
    )
    expect(report.cashFlow.unsortedPayouts).toBe(0)
    expect(report.findings.map((finding) => finding.kind)).not.toContain('unsorted_payouts')
    expect(report.expensesCents).toBe(12_000)
    expect(report.cashFlow.outCents).toBe(12_000)
  })

  test('a branch account cannot see dish costs: coverage is unknown, not 0%', () => {
    const report = reportOf(
      raw({
        dishCostsVisible: false,
        orders: [order({ id: 'o1', at: AT, total: 100, lines: [line({ id: 'l1' })] })],
        dishCosts: new Map([['l1', '10.0000']]),
        movements: [{ reason: 'sale', quantityDelta: '-1.0000', unitCost: '1.0000', orderId: 'o9', outletId: null, at: AT }],
        expenses: [expense('rent', 1)],
      }),
    )
    expect(report.coverage.costedShare).toBeNull()
    expect(report.fallbackCogsCents).toBe(0)
    expect(report.findings.map((finding) => finding.kind)).toEqual(['dish_costs_hidden'])
  })

  test('a branch view lists store-wide costs beside the figure, not in it', () => {
    const report = reportOf(
      raw({
        scope: { start: START, end: END, outletId: 'b1', unassigned: false },
        expenses: [expense('rent', 10_000), expense('rent', 3_000, { outletId: 'b1' }), expense('draw', 99_000)],
      }),
    )
    expect(report.expensesCents).toBe(3_000)
    expect(report.findings).toContainEqual({ kind: 'store_wide_excluded', severity: 'info', cents: 10_000 })
  })
})

describe('profit: windows and trend', () => {
  test('an expense counts when its Manila midnight is inside the window', () => {
    expect(manilaDayOnOrAfter(START)).toBe('2026-10-01')
    expect(manilaDayOnOrAfter(START + 1)).toBe('2026-10-02')
    expect(manilaDayOnOrAfter(START - 1)).toBe('2026-10-01')
  })

  test('an order cancelled after the window: its sale and its void stay out of ingredient cost, like its sales', () => {
    // Sold Sep 30 (inside a September window), cancelled Oct 3 (the next window).
    const septStart = Date.parse('2026-08-31T16:00:00.000Z')
    const soldAt = START - 6 * 60 * 60 * 1000
    const cancelledAt = START + 2 * 24 * 60 * 60 * 1000
    const sale = { reason: 'sale', quantityDelta: '-2.0000', unitCost: '10.0000', outletId: null }
    const movements = [
      { ...sale, orderId: 'cancelled-later', at: soldAt },
      { ...sale, reason: 'void', quantityDelta: '2.0000', orderId: 'cancelled-later', at: cancelledAt },
      // A live order's sale and a partial void from an edit still count.
      { ...sale, orderId: 'live', at: soldAt },
      { ...sale, reason: 'void', quantityDelta: '1.0000', orderId: 'live', at: cancelledAt },
      // No order (a manual sale), or an order the caller cannot read: counted.
      { ...sale, orderId: null, at: soldAt },
      { ...sale, orderId: 'unknown', at: soldAt },
    ]
    const orders = [
      order({ id: 'cancelled-later', at: soldAt, status: 'cancelled' }),
      order({ id: 'live', at: soldAt }),
    ]
    const september = profitFigures(raw({ scope: { start: septStart, end: START, outletId: null, unassigned: false }, orders, movements }))
    const october = profitFigures(raw({ orders, movements }))
    expect(september.ledgerCogsCents).toBe(3 * 2_000)
    expect(september.saleMovements).toBe(3)
    expect(october.ledgerCogsCents).toBe(-1_000)
  })

  test('the trend zero-fills missing buckets', () => {
    expect(profitTrend(['2026-10-01', '2026-10-02'], [], 'purchases')).toEqual([
      expect.objectContaining({ bucket: '2026-10-01', profitCents: 0 }),
      expect.objectContaining({ bucket: '2026-10-02', profitCents: 0 }),
    ])
  })
})
