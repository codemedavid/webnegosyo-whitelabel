import { lineCostCents, movementCostCents, parseDecimal, productCents } from '@/lib/reports/cogs'
import {
  expensesByCategory,
  manilaDayOnOrAfter,
  profitFacts,
  profitFigures,
  profitFiguresByPeriod,
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
          { id: 'lm-1', reason: 'sale', inventoryItemId: 'i1', quantityDelta: '-2.0000', unitCost: '150.0000', orderId: 'o1', outletId: null, at: AT },
          { id: 'lm-2', reason: 'waste', inventoryItemId: 'i1', quantityDelta: '-1.0000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
          // Counted the day after its delivery, half a unit short: a loss (an opening count would not be cost).
          { id: 'lm-3', reason: 'receive', inventoryItemId: 'beef', quantityDelta: '3.0000', unitCost: '40.0000', orderId: null, outletId: null, at: AT - 24 * 60 * 60 * 1000 },
          { id: 'lm-4', reason: 'stocktake', inventoryItemId: 'beef', quantityDelta: '-0.5000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
          { id: 'lm-5', reason: 'receive', inventoryItemId: 'i1', quantityDelta: '10.0000', unitCost: '40.0000', orderId: null, outletId: null, at: AT },
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
    expect(report.lossesCents).toBe(4_000 + 2_000)
    expect(report.directIngredientCents).toBe(3_000)
    expect(report.ingredientCostCents).toBe(30_000 + 12_000 + 6_000 + 3_000)
    expect(report.expensesCents).toBe(50_000)
    expect(report.profitCents).toBe(150_000 - 51_000 - 50_000)
    expect(report.capexCents).toBe(900_000)
    expect(report.notExpenseCents).toBe(100_000)
    expect(report.byCategory.map((row) => row.categoryId)).toEqual(['wages', 'rent'])
    expect(report.ratios.prime).toBeCloseTo((51_000 + 30_000) / 150_000)
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
        movements: [{ id: 'lm-6', reason: 'sale', inventoryItemId: 'i1', quantityDelta: '-1.0000', unitCost: null, orderId: 'o1', outletId: null, at: AT }],
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
        movements: [{ id: 'lm-7', reason: 'sale', inventoryItemId: 'i1', quantityDelta: '-1.0000', unitCost: '1.0000', orderId: 'o1', outletId: null, at: AT }],
        expenses: [expense('rent', 1)],
      }),
    )
    expect(worse.findings).toEqual([{ kind: 'uncosted_dishes', severity: 'warning', uncostedDishes: 1, uncostedShare: expect.closeTo(0.2) }])
  })

  test('stock losses or recipe cost above sales come first: almost always an entry mistake', () => {
    const sale = order({ id: 'o1', at: AT, total: 100, lines: [line({ id: 'l1', quantity: 1 })] })
    const sold = { id: 'lm-s', reason: 'sale' as const, inventoryItemId: 'i1', quantityDelta: '-1.0000', unitCost: '1.0000', orderId: 'o1', outletId: null, at: AT }
    const losing = reportOf(
      raw({
        orders: [sale],
        expenses: [expense('rent', 1)],
        movements: [sold, { id: 'lm-w', reason: 'waste', inventoryItemId: 'i1', quantityDelta: '-5.0000', unitCost: '200.0000', orderId: null, outletId: null, at: AT }],
      }),
    )
    expect(losing.findings[0]).toEqual({ kind: 'losses_over_sales', severity: 'warning', lossesCents: 100_000, netSalesCents: 10_000 })

    const pricey = reportOf(
      raw({ orders: [sale], expenses: [expense('rent', 1)], movements: [{ ...sold, quantityDelta: '-10.0000', unitCost: '82.0000' }] }),
    )
    expect(pricey.findings.map((finding) => finding.kind)).toEqual(['ingredients_over_sales', 'uncosted_dishes'])

    // Above sales but under the P500 floor: a slow day, not a mistake.
    const small = reportOf(raw({ orders: [sale], expenses: [expense('rent', 1)], movements: [{ ...sold, quantityDelta: '-2.0000', unitCost: '100.0000' }] }))
    expect(small.findings.map((finding) => finding.kind)).toEqual(['uncosted_dishes'])
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
        movements: [{ id: 'lm-8', reason: 'sale', inventoryItemId: 'i1', quantityDelta: '-1.0000', unitCost: '1.0000', orderId: 'o9', outletId: null, at: AT }],
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
    const sale = { id: 'lm-9', reason: 'sale', inventoryItemId: 'i1', quantityDelta: '-2.0000', unitCost: '10.0000', outletId: null }
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

describe('profit: opening counts set a shelf up, they are not ingredient cost', () => {
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS
  type Move = ProfitRawInput['movements'][number]
  let next = 0
  const move = (reason: string, quantityDelta: string, at: number, extra: Partial<Move> = {}): Move => ({
    id: `n-${String((next += 1)).padStart(4, '0')}`,
    reason,
    inventoryItemId: 'nachos',
    quantityDelta,
    unitCost: '50.0000',
    orderId: null,
    outletId: null,
    at,
    ...extra,
  })
  const varianceOf = (movements: Move[]) => profitFigures(raw({ movements })).countVarianceCents

  test("an opening count and the same day's fix to it change nothing (Loly's: 500 typed for 10, then counted 10)", () => {
    const movements = [move('stocktake', '500.0000', AT), move('stocktake', '-490.0000', AT + HOUR_MS)]
    expect(varianceOf(movements)).toBe(0)
    expect(profitFigures(raw({ movements })).uncostedMovements).toBe(0)
  })

  test('the first count of a shelf that sold before it was ever counted is its opening', () => {
    const movements = [move('sale', '-17.0000', AT - 3 * DAY_MS), move('stocktake', '29.0000', AT)]
    expect(varianceOf(movements)).toBe(0)
  })

  test('a delivery is a baseline too: counting less after selling from it is a loss', () => {
    const movements = [move('receive', '10.0000', AT), move('sale', '-3.0000', AT + HOUR_MS), move('stocktake', '-2.0000', AT + 2 * HOUR_MS)]
    expect(varianceOf(movements)).toBe(2 * 5_000)
  })

  test('a count after a sale from the shelf measures it, even on the opening day', () => {
    const movements = [move('stocktake', '10.0000', AT), move('sale', '-1.0000', AT + HOUR_MS), move('stocktake', '-2.0000', AT + 2 * HOUR_MS)]
    expect(varianceOf(movements)).toBe(2 * 5_000)
  })

  test('a count on a later business day measures the shelf, sold from or not (oil used without a recipe)', () => {
    const movements = [move('stocktake', '10.0000', AT), move('stocktake', '-3.0000', AT + DAY_MS)]
    expect(varianceOf(movements)).toBe(3 * 5_000)
  })

  test('shelves are an item at one branch: another item or branch never sets this one up', () => {
    const movements = [
      move('stocktake', '10.0000', AT - DAY_MS, { inventoryItemId: 'cheese' }),
      move('stocktake', '10.0000', AT - DAY_MS, { outletId: 'b-1' }),
      move('stocktake', '4.0000', AT),
    ]
    expect(varianceOf(movements)).toBe(0)
    const later = [move('stocktake', '10.0000', AT - DAY_MS), move('stocktake', '-1.0000', AT, { outletId: 'b-1' })]
    expect(varianceOf(later)).toBe(0)
  })

  test("an opening count before the window still makes a later fix inside it a measurement only when a day passed", () => {
    const openedYesterday = [move('stocktake', '500.0000', START - HOUR_MS), move('stocktake', '-490.0000', START + HOUR_MS)]
    // Opened Sep 30 23:00 Manila, fixed Oct 1 01:00: a different business day, so it is a count.
    expect(varianceOf(openedYesterday)).toBe(490 * 5_000)
  })

  test('the trend leaves opening counts out too', () => {
    const movements = [move('stocktake', '500.0000', AT), move('stocktake', '-490.0000', AT + HOUR_MS)]
    const rows = profitFiguresByPeriod(raw({ movements }), 'day')
    expect(rows.every((row) => row.countVarianceCents === 0)).toBe(true)
  })
})

describe('profit: a count gives back what counts took, never more', () => {
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS
  type Move = ProfitRawInput['movements'][number]
  let next = 0
  const move = (reason: string, quantityDelta: string, at: number, extra: Partial<Move> = {}): Move => ({
    id: `m-${String((next += 1)).padStart(4, '0')}`,
    reason,
    inventoryItemId: 'egg',
    quantityDelta,
    unitCost: '6.0000',
    orderId: null,
    outletId: null,
    at,
    ...extra,
  })
  // Counted (and sold from) the day before, so every count below measures the shelf.
  const opened = () => [move('stocktake', '30.0000', AT - 2 * DAY_MS), move('sale', '-1.0000', AT - 2 * DAY_MS + HOUR_MS)]
  const varianceOf = (movements: Move[]) => profitFigures(raw({ movements })).countVarianceCents

  test("eggs bought without a delivery and counted in are not a negative cost (Loly's: +22 eggs after selling)", () => {
    expect(varianceOf([...opened(), move('stocktake', '22.0000', AT)])).toBe(0)
  })

  test('a recount fixing a miscount gives the loss back (Chicken -4, then +5 a minute later)', () => {
    const movements = [...opened(), move('stocktake', '-4.0000', AT, { unitCost: '80.0000' }), move('stocktake', '5.0000', AT + 60_000, { unitCost: '80.0000' })]
    expect(varianceOf(movements)).toBe(0)
  })

  test('a loss in an earlier window can be given back in this one, and only that much', () => {
    const movements = [
      ...opened(),
      move('stocktake', '-3.0000', START - HOUR_MS),
      move('sale', '-1.0000', START + HOUR_MS),
      move('stocktake', '10.0000', AT),
    ]
    expect(varianceOf(movements)).toBe(-3 * 600)
  })

  test('a loss after a gain and a sale still counts in full', () => {
    const movements = [...opened(), move('stocktake', '10.0000', AT), move('sale', '-1.0000', AT + HOUR_MS), move('stocktake', '-4.0000', AT + DAY_MS)]
    expect(varianceOf(movements)).toBe(4 * 600)
  })

  test("a count typed too high and fixed seconds later is no loss (Uncle Drei: +2,997.51 kg, then -2,997)", () => {
    const movements = [...opened(), move('stocktake', '2997.5100', AT, { unitCost: '255.0000' }), move('stocktake', '-2997.0000', AT + 9_000, { unitCost: '255.0000' })]
    expect(varianceOf(movements)).toBe(0)
  })

  test('back-to-back counts are one recount: the last one carries what they found together', () => {
    const movements = [...opened(), move('stocktake', '-5.0000', AT), move('stocktake', '2.0000', AT + HOUR_MS)]
    const figures = profitFigures(raw({ movements }))
    expect(figures.countVarianceCents).toBe(3 * 600)
    const byDay = profitFiguresByPeriod(raw({ movements: [...opened(), move('stocktake', '-5.0000', AT), move('stocktake', '2.0000', AT + DAY_MS)] }), 'day')
    expect(byDay.map((row) => row.countVarianceCents)).toEqual([0, 3 * 600])
  })

  test('a delivery between two counts makes them two counts', () => {
    const movements = [...opened(), move('stocktake', '-5.0000', AT), move('receive', '10.0000', AT + HOUR_MS), move('stocktake', '2.0000', AT + 2 * HOUR_MS)]
    expect(varianceOf(movements)).toBe(5 * 600 - 2 * 600)
  })

  test('a report never reads counts written after its window', () => {
    const movements = [...opened(), move('stocktake', '-5.0000', END - HOUR_MS), move('stocktake', '5.0000', END + HOUR_MS)]
    expect(varianceOf(movements)).toBe(5 * 600)
  })

  test('each shelf keeps its own balance, and a count without a cost is uncosted, not given back', () => {
    const movements = [
      ...opened(),
      move('stocktake', '-2.0000', AT),
      move('stocktake', '5.0000', AT + HOUR_MS, { unitCost: null }),
      move('stocktake', '5.0000', AT + 2 * HOUR_MS, { outletId: 'b-1' }),
    ]
    const figures = profitFigures(raw({ movements }))
    expect(figures.countVarianceCents).toBe(2 * 600)
    expect(figures.uncostedMovements).toBe(1)
  })

  test('counts at the same instant are taken in id order: the last id carries the recount', () => {
    const last = move('stocktake', '-3.0000', AT, { id: 'm-b' })
    const first = move('stocktake', '1.0000', AT, { id: 'm-a' })
    const facts = profitFacts(raw({ movements: [...opened(), last, first] })).filter((fact) => fact.kind === 'movement' && fact.reason === 'stocktake')
    expect(facts.map((fact) => (fact.kind === 'movement' ? fact.cents : null))).toEqual([2 * 600, 0])
  })
})

describe('profit: a count straight after a delivery corrects the delivery', () => {
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS
  type Move = ProfitRawInput['movements'][number]
  let next = 0
  const move = (reason: string, quantityDelta: string, at: number, extra: Partial<Move> = {}): Move => ({
    id: `d-${String((next += 1)).padStart(4, '0')}`,
    reason,
    inventoryItemId: 'caramel',
    quantityDelta,
    unitCost: reason === 'receive' ? null : '256.0000',
    orderId: null,
    outletId: null,
    at,
    ...extra,
  })
  // Counted and sold from long before: every count below measures the shelf.
  const opened = () => [move('stocktake', '3.0000', AT - 20 * DAY_MS), move('sale', '-0.0450', AT - 19 * DAY_MS)]
  const varianceOf = (movements: Move[]) => profitFigures(raw({ movements })).countVarianceCents

  test('"4000" kg received for 4000 g and counted 2 minutes later is no loss (Uncle Drei, P1,022,976)', () => {
    const movements = [...opened(), move('receive', '4000.0000', AT), move('stocktake', '-3996.0000', AT + 2 * 60_000)]
    expect(varianceOf(movements)).toBe(0)
  })

  test('a shortfall bigger than the delivery measures the shelf: all of it is lost (stock used by counting it down)', () => {
    const movements = [...opened(), move('receive', '2.0000', AT), move('stocktake', '-3.0000', AT + 60_000)]
    expect(varianceOf(movements)).toBe(3 * 25_600)
  })

  test('a count that finds only part of a delivery missing measures the shelf (old stock gone is as likely)', () => {
    const movements = [...opened(), move('receive', '10.0000', AT), move('stocktake', '-4.0000', AT + 5 * 60_000)]
    expect(varianceOf(movements)).toBe(4 * 25_600)
  })

  test('a delivery entered by mistake and counted straight back out is no loss', () => {
    const movements = [...opened(), move('receive', '10.0000', AT), move('stocktake', '-10.0000', AT + 60_000)]
    expect(varianceOf(movements)).toBe(0)
    // 99% missing still undoes it; 98% does not.
    expect(varianceOf([...opened(), move('receive', '100.0000', AT), move('stocktake', '-99.0000', AT + 60_000)])).toBe(0)
    expect(varianceOf([...opened(), move('receive', '100.0000', AT), move('stocktake', '-98.0000', AT + 60_000)])).toBe(98 * 25_600)
  })

  test('several deliveries in a row are corrected together; a fix and its recount are one', () => {
    const movements = [
      ...opened(),
      move('receive', '2000.0000', AT),
      move('receive', '2000.0000', AT + 1_000),
      move('stocktake', '0.0000', AT + 60_000),
      move('stocktake', '-3996.0000', AT + 120_000),
    ]
    expect(varianceOf(movements)).toBe(0)
  })

  test('a sale or waste between the delivery and the count: the count measures the shelf', () => {
    const sale = [...opened(), move('receive', '4000.0000', AT), move('sale', '-0.0450', AT + 1_000), move('stocktake', '-3996.0000', AT + 60_000)]
    expect(varianceOf(sale)).toBe(3996 * 25_600)
    const waste = [...opened(), move('receive', '4000.0000', AT), move('waste', '-0.0100', AT + 1_000), move('stocktake', '-3996.0000', AT + 60_000)]
    expect(varianceOf(waste)).toBe(3996 * 25_600)
  })

  test('a count more than 30 minutes after the delivery measures the shelf (Gungjeon: raw beef counted down 6 h later)', () => {
    const at30 = [...opened(), move('receive', '25.0000', AT), move('stocktake', '-25.0000', AT + 30 * 60_000)]
    // 30 minutes exactly is still a fix.
    expect(varianceOf(at30)).toBe(0)
    const at31 = [...opened(), move('receive', '25.0000', AT), move('stocktake', '-25.0000', AT + 31 * 60_000)]
    expect(varianceOf(at31)).toBe(25 * 25_600)
    const nextDay = [...opened(), move('receive', '3.0000', AT), move('stocktake', '-0.5000', AT + DAY_MS)]
    expect(varianceOf(nextDay)).toBe(Math.round(0.5 * 25_600))
  })

  test('a count that finds MORE after a delivery is unchanged (gives back earlier losses only)', () => {
    const movements = [...opened(), move('stocktake', '-1.0000', AT - 2 * HOUR_MS), move('receive', '2.0000', AT), move('stocktake', '3.0000', AT + 60_000)]
    expect(varianceOf(movements)).toBe(0)
  })
})

describe('profit: a deleted order takes its ingredient cost with its sales', () => {
  const ORDER = '0b7e5a52-3c5c-4f7a-9d55-2f6c1d0e9a11'
  const GONE = '6f1c2b7d-9a3e-4c51-8f0d-1e2a3b4c5d6e'
  const CONVEX = 'k57c9q3w2x1y0z8a7b6c5d4e3f'
  const kept = order({ id: ORDER, at: AT, total: 100, paymentStatus: 'paid', lines: [line({ id: 'k1', quantity: 1, subtotal: 100 })] })
  const sale = (orderId: string | null, id: string) => ({
    id,
    reason: 'sale',
    inventoryItemId: 'tea',
    quantityDelta: '-1.0000',
    unitCost: '10.0000',
    orderId,
    outletId: null,
    at: AT + 1_000,
  })

  test('a sale whose order was deleted is no cost (Uncle Drei: 1,507 orders deleted, P29k of recipe cost stayed)', () => {
    const figures = profitFigures(raw({ orders: [kept], movements: [sale(ORDER, 's1'), sale(GONE, 's2')] }))
    expect(figures.ledgerCogsCents).toBe(1_000)
    expect(figures.saleMovements).toBe(1)
  })

  test('ledger rows without an order, or with a non-platform (Convex) id, still count', () => {
    const figures = profitFigures(raw({ orders: [kept], movements: [sale(null, 's1'), sale(CONVEX, 's2')] }))
    expect(figures.ledgerCogsCents).toBe(2_000)
  })

  test("a deleted order's sale still moved the shelf: the count after it measures it", () => {
    const at = AT - 10 * 60 * 60 * 1000
    const movements = [
      { ...sale(null, 'c0'), reason: 'stocktake', quantityDelta: '5.0000', at },
      { ...sale(GONE, 's9'), at: at + 1_000 },
      { ...sale(null, 'c1'), reason: 'stocktake', quantityDelta: '-1.0000', at: at + 2_000 },
    ]
    // The stock left with the deleted order's sale, so the second count measures the shelf: a P10 loss.
    expect(profitFigures(raw({ orders: [kept], movements })).countVarianceCents).toBe(1_000)
  })
})
