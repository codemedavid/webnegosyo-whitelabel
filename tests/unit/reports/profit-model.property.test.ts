/**
 * Profit invariants over generated stores (expense plan §9 "Property"):
 * kinds that are not expenses never move profit, a cancelled order never
 * costs anything, stock purchases are never counted twice, and every
 * breakdown adds up to its total exactly.
 */
import fc from 'fast-check'
import {
  expensesByCategory,
  profitFigures,
  profitFiguresByPeriod,
  PROFIT_GRAINS,
  type ProfitCategory,
  type ProfitExpense,
  type ProfitRawInput,
} from '@/lib/reports/profit-facts'
import { buildProfitReport, profitTrend, type ProfitReport } from '@/lib/reports/profit-model'
import { bucketKeys } from '@/lib/reports/period'
import { orderFigures } from '@/lib/reports/sales-model'
import { PROFIT_CATEGORIES, profitStoreArb, type ProfitStore } from '../../fixtures/profit-stores'
import { propertyParameters } from '../../utils/property'

const DAY_MS = 24 * 60 * 60 * 1000
const SPREAD = { start: Date.parse('2026-09-22T16:00:00.000Z'), end: Date.parse('2026-10-10T16:00:00.000Z') }
/** Wide enough for every generated row, voids an hour after their sale included. */
const ALL = { start: SPREAD.start, end: SPREAD.end + DAY_MS }
const REPORT = { start: Date.parse('2026-09-24T16:00:00.000Z'), end: Date.parse('2026-10-08T16:00:00.000Z') }

const CATEGORIES: ProfitCategory[] = PROFIT_CATEGORIES.map(({ key, ...category }) => ({ id: key, ...category }))
const categoryOf = (key: string) => CATEGORIES.find((category) => category.id === key) as ProfitCategory

function rawOf(store: ProfitStore, window = ALL): ProfitRawInput {
  return {
    scope: { ...window, outletId: null, unassigned: false },
    orders: store.orders,
    dishCosts: new Map(store.dishCosts.map((cost) => [cost.lineId, cost.unitCost])),
    movements: store.movements,
    expenses: store.expenses,
    categories: CATEGORIES,
    payouts: store.payouts,
    dishCostsVisible: true,
  }
}

function reportOf(raw: ProfitRawInput): ProfitReport {
  return buildProfitReport({ figures: profitFigures(raw), categories: expensesByCategory(raw), previousCategories: null })
}

const extraExpenseArb = (keys: readonly string[]) =>
  fc.array(
    fc.record({
      key: fc.constantFrom(...keys),
      amountCents: fc.integer({ min: 1, max: 9_000_000 }),
      day: fc.constantFrom('2026-09-25', '2026-10-01', '2026-10-08'),
      isStockPurchase: fc.boolean(),
    }),
    { minLength: 1, maxLength: 5 },
  )

const asExpenses = (drafts: Array<{ key: string; amountCents: number; day: string; isStockPurchase: boolean }>): ProfitExpense[] =>
  drafts.map((draft) => ({
    categoryId: draft.key,
    amountCents: draft.amountCents,
    spentOn: draft.day,
    outletId: null,
    isStockPurchase: draft.isStockPurchase,
    status: 'recorded',
    shiftCashMovementId: null,
  }))

describe('profit invariants', () => {
  test('capex and not-expense kinds never change profit (they do change cash out)', () => {
    const keys = CATEGORIES.filter((category) => category.group === 'capex' || category.group === 'not_expense').map((category) => category.id)
    fc.assert(
      fc.property(profitStoreArb(SPREAD), extraExpenseArb(keys), (store, drafts) => {
        const before = reportOf(rawOf(store))
        const extra = asExpenses(drafts)
        const after = reportOf({ ...rawOf(store), expenses: [...store.expenses, ...extra] })
        expect(after.profitCents).toBe(before.profitCents)
        expect(after.expensesCents).toBe(before.expensesCents)
        expect(after.ingredientCostCents).toBe(before.ingredientCostCents)
        expect(after.cashFlow.outCents - before.cashFlow.outCents).toBe(extra.reduce((sum, row) => sum + row.amountCents, 0))
      }),
      propertyParameters(),
    )
  })

  test('a cancelled order never counts: no sales, no ingredient cost, whatever its ledger did', () => {
    fc.assert(
      fc.property(profitStoreArb(SPREAD), (store) => {
        const reversed = new Set(store.orders.filter((order) => !orderFigures(order).isLive).map((order) => order.id))
        const without: ProfitStore = {
          ...store,
          orders: store.orders.filter((order) => !reversed.has(order.id)),
          movements: store.movements.filter((move) => move.orderId === null || !reversed.has(move.orderId)),
        }
        const withThem = reportOf(rawOf(store))
        const withoutThem = reportOf(rawOf(without))
        expect(withThem.netSalesCents).toBe(withoutThem.netSalesCents)
        expect(withThem.recipeCogsCents).toBe(withoutThem.recipeCogsCents)
        // Its sale movement still says "this store tracks stock" (the basis rule
        // counts every sale movement); with the basis fixed, profit is the same.
        if (withThem.ingredientBasis === withoutThem.ingredientBasis) {
          expect(withThem.profitCents).toBe(withoutThem.profitCents)
        }
      }),
      propertyParameters(),
    )
  })

  test('stock purchases never reduce profit when the store tracks stock (cash flow only)', () => {
    fc.assert(
      fc.property(profitStoreArb(SPREAD), extraExpenseArb(['ingredients', 'ice']), (store, drafts) => {
        const before = reportOf(rawOf(store))
        fc.pre(before.ingredientBasis === 'recipes')
        const extra = asExpenses(drafts.map((draft) => ({ ...draft, isStockPurchase: true })))
        const after = reportOf({ ...rawOf(store), expenses: [...store.expenses, ...extra] })
        expect(after.profitCents).toBe(before.profitCents)
        expect(after.ingredientCostCents).toBe(before.ingredientCostCents)
        expect(after.cashFlow.outCents).toBeGreaterThan(before.cashFlow.outCents)
      }),
      propertyParameters(),
    )
  })

  test('without stock tracking every ingredient purchase is the ingredient cost (labelled an estimate)', () => {
    fc.assert(
      fc.property(profitStoreArb(SPREAD), (store) => {
        const raw = rawOf({ ...store, movements: store.movements.filter((move) => move.reason !== 'sale') })
        const report = reportOf(raw)
        expect(report.ingredientBasis).toBe('purchases')
        expect(report.ingredientCostCents).toBe(report.byGroup.ingredients)
        expect(report.findings.some((finding) => finding.kind === 'ingredient_estimate')).toBe(true)
      }),
      propertyParameters(),
    )
  })

  test('Σ categories = expenses, Σ cash-out lines = cash out, and the sentence adds up', () => {
    fc.assert(
      fc.property(profitStoreArb(SPREAD), (store) => {
        const report = reportOf(rawOf(store, REPORT))
        expect(report.byCategory.reduce((sum, row) => sum + row.cents, 0)).toBe(report.expensesCents)
        expect(report.cashFlow.out.reduce((sum, line) => sum + line.cents, 0)).toBe(report.cashFlow.outCents)
        expect(report.cashFlow.outCents).toBe(Object.values(report.byGroup).reduce((sum, cents) => sum + cents, 0))
        expect(report.profitCents).toBe(report.netSalesCents - report.ingredientCostCents - report.expensesCents)
        expect(Number.isSafeInteger(report.profitCents)).toBe(true)
      }),
      propertyParameters(),
    )
  })

  test('the trend adds up to the summary exactly, for every grain', () => {
    fc.assert(
      fc.property(profitStoreArb(SPREAD), fc.constantFrom(...PROFIT_GRAINS), (store, grain) => {
        const raw = rawOf(store, REPORT)
        const report = reportOf(raw)
        const points = profitTrend(bucketKeys(REPORT.start, REPORT.end, grain), profitFiguresByPeriod(raw, grain), report.ingredientBasis)
        const total = (pick: (point: (typeof points)[number]) => number) => points.reduce((sum, point) => sum + pick(point), 0)
        expect(total((point) => point.netSalesCents)).toBe(report.netSalesCents)
        expect(total((point) => point.ingredientCostCents)).toBe(report.ingredientCostCents)
        expect(total((point) => point.expensesCents)).toBe(report.expensesCents)
        expect(total((point) => point.profitCents)).toBe(report.profitCents)
        expect(total((point) => point.cashOutCents)).toBe(report.cashFlow.outCents)
      }),
      propertyParameters(),
    )
  })

  test('a category used by one recurring key in the previous period and not now is flagged', () => {
    fc.assert(
      fc.property(fc.constantFrom('rent', 'electricity', 'water', 'wages'), fc.integer({ min: 1, max: 10_000_000 }), (key, cents) => {
        const category = categoryOf(key)
        const row = { categoryId: category.id, name: category.name, icon: category.icon, group: category.group, systemKey: category.systemKey, cents, stockPurchaseCents: 0, expenses: 1 }
        const report = buildProfitReport({ figures: profitFigures(rawOf({ orders: [], dishCosts: [], movements: [], expenses: [], payouts: [] })), categories: [], previousCategories: [row] })
        expect(report.findings[0]).toMatchObject({ kind: 'missing_recurring', systemKey: key, previousCents: cents })
      }),
      propertyParameters(),
    )
  })
})
