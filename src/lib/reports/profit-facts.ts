/**
 * The TypeScript twin of the profit SQL functions
 * (supabase/migrations/20261022120300_report_profit.sql): raw rows → the
 * figures `report_profit_summary`, `report_profit_by_period` and
 * `report_expenses_by_category` return. Pure.
 *
 * Both sides turn the window into the same FACTS (one live order, one order
 * line, one ledger movement, one expense, one unsorted pay-out), each dated
 * by its Manila business day, and then only add them up. So the summary and
 * the period rows are sums of the same facts and always agree, and
 * tests/unit/reports/report-profit-parity.property.test.ts can demand the SQL
 * equal this file to the centavo.
 *
 * Scope rules, shared with the SQL:
 *   * orders, ledger movements and drawer pay-outs: created in [start, end);
 *   * expenses: `status = 'recorded'` and the Manila midnight of `spent_on`
 *     in [start, end) — so a "so far" window ending mid-day keeps today's;
 *   * a branch reads that branch's rows; "unassigned" reads the rows with no
 *     branch (for expenses: the store-wide ones); otherwise everything.
 */

import type { ExpenseGroup } from '@/lib/expenses/types'
import { toCents } from './money'
import { lineCostCents, movementCostCents, isUsageReason, type UsageReason } from './cogs'
import { orderFigures, type ReportOrder } from './sales-model'
import { itemKey } from './sales-breakdowns'

type Numeric = number | string

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MANILA_OFFSET_MS = 8 * HOUR_MS

export const PROFIT_GRAINS = ['day', 'week', 'month'] as const
export type ProfitGrain = (typeof PROFIT_GRAINS)[number]

/** The groups that make up "Expenses" (Gastos): everything operating except ingredients. */
export const EXPENSE_LINE_GROUPS = ['staff', 'occupancy', 'utilities', 'operating', 'admin', 'other'] as const satisfies readonly ExpenseGroup[]
/** Groups whose store-wide rows a branch view leaves out (they reduce profit). */
const PROFIT_GROUPS: readonly ExpenseGroup[] = ['ingredients', ...EXPENSE_LINE_GROUPS]

export interface ProfitScope {
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  /** One branch, or null. */
  outletId: string | null
  /** Only rows with no branch (orders without one; store-wide expenses). */
  unassigned: boolean
}

export interface LedgerMovement {
  reason: string
  quantityDelta: Numeric
  unitCost: Numeric | null
  /** stock_movements.order_id (text). */
  orderId: string | null
  outletId: string | null
  at: number
}

export interface ProfitExpense {
  categoryId: string
  amountCents: number
  /** Manila business date, YYYY-MM-DD. */
  spentOn: string
  outletId: string | null
  isStockPurchase: boolean
  status: 'recorded' | 'void'
  shiftCashMovementId: string | null
}

export interface ProfitCategory {
  id: string
  name: string
  icon: string | null
  group: ExpenseGroup
  systemKey: string | null
}

export interface DrawerPayout {
  id: string
  kind: string
  amount: Numeric
  outletId: string | null
  at: number
}

export interface ProfitRawInput {
  scope: ProfitScope
  /** The store's orders (any window; filtered here). */
  orders: readonly ReportOrder[]
  /** order_item_costs: order line id → dish cost at sale (one dish). */
  dishCosts: ReadonlyMap<string, Numeric>
  /** The store's ledger (any window): sales outside it still decide which orders were stock-tracked. */
  movements: readonly LedgerMovement[]
  expenses: readonly ProfitExpense[]
  categories: readonly ProfitCategory[]
  payouts: readonly DrawerPayout[]
  /** order_item_costs is readable by store-wide cost holders only (its RLS). */
  dishCostsVisible: boolean
}

/** What `report_profit_summary` returns. */
export interface ProfitFigures {
  /** Live orders. */
  orders: number
  netSalesCents: number
  collectedCents: number
  /** `sale` movements in the window: ≥ 1 means the store tracks stock. */
  saleMovements: number
  /** Σ sale + void movements at their frozen cost (costed ones). */
  ledgerCogsCents: number
  /** Σ dish cost at sale × quantity, for live orders with no `sale` movement at all. */
  fallbackCogsCents: number
  fallbackOrders: number
  wasteCents: number
  /** Stock counts at frozen cost: + = less on the shelf than the ledger said. */
  countVarianceCents: number
  /** Usage movements (sale, void, waste, count) with no recorded cost. */
  uncostedMovements: number
  soldQuantity: number
  costedQuantity: number
  soldDishes: number
  costedDishes: number
  dishCostsVisible: boolean
  /** Recorded expenses by group. */
  groupCents: Readonly<Record<ExpenseGroup, number>>
  /** The part of `groupCents.ingredients` that went into stock. */
  ingredientStockCents: number
  expenseCount: number
  /** Branch view only: store-wide expenses that reduce profit but belong to no branch. */
  storeWideExpenseCents: number
  unsortedPayouts: number
  unsortedPayoutCents: number
}

/** One row of `report_profit_by_period`. */
export interface ProfitPeriodFigures {
  bucket: string
  orders: number
  netSalesCents: number
  collectedCents: number
  saleMovements: number
  ledgerCogsCents: number
  fallbackCogsCents: number
  wasteCents: number
  countVarianceCents: number
  /** Ingredients-group expenses that did NOT go into stock. */
  ingredientDirectCents: number
  /** Ingredients-group expenses that went into stock. */
  ingredientStockCents: number
  /** The six expense groups (staff … other). */
  expensesCents: number
  /** Every recorded expense, all groups (cash out). */
  cashOutCents: number
}

/** One row of `report_expenses_by_category`. */
export interface ExpenseCategoryTotal {
  categoryId: string
  name: string
  icon: string | null
  group: ExpenseGroup
  systemKey: string | null
  cents: number
  stockPurchaseCents: number
  expenses: number
}

// ---------------------------------------------------------------------------
// Manila days
// ---------------------------------------------------------------------------

/** The Manila day of an instant, YYYY-MM-DD. */
export function manilaDay(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function manilaMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`) - MANILA_OFFSET_MS
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The first Manila day whose midnight is at or after `ms` (SQL reporting.manila_day_on_or_after). */
export function manilaDayOnOrAfter(ms: number): string {
  const day = manilaDay(ms)
  return manilaMidnight(day) >= ms ? day : addDays(day, 1)
}

/** The bucket a Manila day falls in: itself, its Monday, or the 1st of its month. */
export function dayBucket(day: string, grain: ProfitGrain): string {
  if (grain === 'day') return day
  if (grain === 'month') return `${day.slice(0, 7)}-01`
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export type ProfitFact =
  | { kind: 'order'; day: string; netCents: number; collectedCents: number; usesFallback: boolean }
  | { kind: 'line'; day: string; quantity: number; dishKey: string; isCosted: boolean; fallbackCents: number }
  | { kind: 'movement'; day: string; reason: UsageReason; cents: number | null }
  | { kind: 'expense'; day: string; group: ExpenseGroup; isStockPurchase: boolean; cents: number }
  | { kind: 'store_wide_expense'; day: string; cents: number }
  | { kind: 'payout'; day: string; cents: number }

function inWindow(scope: ProfitScope, at: number): boolean {
  return at >= scope.start && at < scope.end
}

function inBranch(scope: ProfitScope, outletId: string | null): boolean {
  if (scope.unassigned) return outletId === null
  return scope.outletId === null || outletId === scope.outletId
}

function orderFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  const trackedOrders = new Set(
    input.movements.filter((move) => move.reason === 'sale' && move.orderId !== null).map((move) => move.orderId),
  )
  const costs: ReadonlyMap<string, Numeric> = input.dishCostsVisible ? input.dishCosts : new Map()
  return input.orders
    .filter((order) => inWindow(scope, order.at) && inBranch(scope, order.outletId))
    .flatMap((order): ProfitFact[] => {
      const figures = orderFigures(order)
      if (!figures.isLive) return []
      const day = manilaDay(order.at)
      const usesFallback = !trackedOrders.has(order.id)
      const lines = order.lines.map((line): ProfitFact => {
        const cost = costs.get(line.id)
        const isCosted = cost !== undefined
        return {
          kind: 'line',
          day,
          quantity: line.quantity,
          dishKey: itemKey({ menuItemId: line.menuItemId, name: line.name, isUnrecorded: false }),
          isCosted,
          fallbackCents: usesFallback && isCosted ? lineCostCents(cost, line.quantity) : 0,
        }
      })
      return [
        { kind: 'order', day, netCents: figures.netCents, collectedCents: figures.collectedCents, usesFallback },
        ...lines,
      ]
    })
}

function movementFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  return input.movements.flatMap((move): ProfitFact[] => {
    if (!isUsageReason(move.reason) || !inWindow(scope, move.at) || !inBranch(scope, move.outletId)) return []
    return [{ kind: 'movement', day: manilaDay(move.at), reason: move.reason, cents: movementCostCents(move.quantityDelta, move.unitCost) }]
  })
}

function expenseFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  const first = manilaDayOnOrAfter(scope.start)
  const last = manilaDayOnOrAfter(scope.end)
  const groups = new Map(input.categories.map((category) => [category.id, category.group]))
  return input.expenses.flatMap((expense): ProfitFact[] => {
    const group = groups.get(expense.categoryId)
    if (expense.status !== 'recorded' || group === undefined) return []
    if (expense.spentOn < first || expense.spentOn >= last) return []
    if (inBranch(scope, expense.outletId)) {
      return [{ kind: 'expense', day: expense.spentOn, group, isStockPurchase: expense.isStockPurchase, cents: expense.amountCents }]
    }
    if (scope.outletId !== null && expense.outletId === null && PROFIT_GROUPS.includes(group)) {
      return [{ kind: 'store_wide_expense', day: expense.spentOn, cents: expense.amountCents }]
    }
    return []
  })
}

function payoutFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  const sorted = new Set(
    input.expenses.filter((expense) => expense.status === 'recorded' && expense.shiftCashMovementId !== null).map((expense) => expense.shiftCashMovementId),
  )
  return input.payouts.flatMap((payout): ProfitFact[] => {
    if (payout.kind !== 'pay_out' || sorted.has(payout.id)) return []
    if (!inWindow(scope, payout.at) || !inBranch(scope, payout.outletId)) return []
    return [{ kind: 'payout', day: manilaDay(payout.at), cents: toCents(payout.amount) }]
  })
}

/** Every fact in the window, as the SQL's reporting.profit_facts lists them. */
export function profitFacts(input: ProfitRawInput): ProfitFact[] {
  return [...orderFacts(input), ...movementFacts(input), ...expenseFacts(input), ...payoutFacts(input)]
}

// ---------------------------------------------------------------------------
// Sums
// ---------------------------------------------------------------------------

const emptyGroups = (): Record<ExpenseGroup, number> => ({
  ingredients: 0,
  staff: 0,
  occupancy: 0,
  utilities: 0,
  operating: 0,
  admin: 0,
  other: 0,
  capex: 0,
  not_expense: 0,
})

function sumOf<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0)
}

function only<K extends ProfitFact['kind']>(facts: readonly ProfitFact[], kind: K): Extract<ProfitFact, { kind: K }>[] {
  return facts.filter((fact): fact is Extract<ProfitFact, { kind: K }> => fact.kind === kind)
}

function movementCents(facts: readonly ProfitFact[], reasons: readonly UsageReason[]): number {
  return sumOf(only(facts, 'movement').filter((fact) => reasons.includes(fact.reason)), (fact) => fact.cents ?? 0)
}

/** `report_profit_summary`, from facts. */
export function sumProfitFacts(facts: readonly ProfitFact[], dishCostsVisible: boolean): ProfitFigures {
  const orders = only(facts, 'order')
  const lines = only(facts, 'line')
  const movements = only(facts, 'movement')
  const expenses = only(facts, 'expense')
  const payouts = only(facts, 'payout')
  const groupCents = expenses.reduce((acc, fact) => ({ ...acc, [fact.group]: acc[fact.group] + fact.cents }), emptyGroups())
  return {
    orders: orders.length,
    netSalesCents: sumOf(orders, (fact) => fact.netCents),
    collectedCents: sumOf(orders, (fact) => fact.collectedCents),
    saleMovements: movements.filter((fact) => fact.reason === 'sale').length,
    ledgerCogsCents: movementCents(facts, ['sale', 'void']),
    fallbackCogsCents: sumOf(lines, (fact) => fact.fallbackCents),
    fallbackOrders: orders.filter((fact) => fact.usesFallback).length,
    wasteCents: movementCents(facts, ['waste']),
    countVarianceCents: movementCents(facts, ['stocktake']),
    uncostedMovements: movements.filter((fact) => fact.cents === null).length,
    soldQuantity: sumOf(lines, (fact) => fact.quantity),
    costedQuantity: sumOf(lines.filter((fact) => fact.isCosted), (fact) => fact.quantity),
    soldDishes: new Set(lines.map((fact) => fact.dishKey)).size,
    costedDishes: new Set(lines.filter((fact) => fact.isCosted).map((fact) => fact.dishKey)).size,
    dishCostsVisible,
    groupCents,
    ingredientStockCents: sumOf(expenses.filter((fact) => fact.group === 'ingredients' && fact.isStockPurchase), (fact) => fact.cents),
    expenseCount: expenses.length,
    storeWideExpenseCents: sumOf(only(facts, 'store_wide_expense'), (fact) => fact.cents),
    unsortedPayouts: payouts.length,
    unsortedPayoutCents: sumOf(payouts, (fact) => fact.cents),
  }
}

function periodRow(bucket: string, facts: readonly ProfitFact[]): ProfitPeriodFigures {
  const figures = sumProfitFacts(facts, true)
  const ingredientStockCents = figures.ingredientStockCents
  return {
    bucket,
    orders: figures.orders,
    netSalesCents: figures.netSalesCents,
    collectedCents: figures.collectedCents,
    saleMovements: figures.saleMovements,
    ledgerCogsCents: figures.ledgerCogsCents,
    fallbackCogsCents: figures.fallbackCogsCents,
    wasteCents: figures.wasteCents,
    countVarianceCents: figures.countVarianceCents,
    ingredientDirectCents: figures.groupCents.ingredients - ingredientStockCents,
    ingredientStockCents,
    expensesCents: sumOf(EXPENSE_LINE_GROUPS, (group) => figures.groupCents[group]),
    cashOutCents: sumOf(Object.values(figures.groupCents), (cents) => cents),
  }
}

/** `report_profit_by_period`, from facts: buckets that have any fact, in order. */
export function sumProfitFactsByPeriod(facts: readonly ProfitFact[], grain: ProfitGrain): ProfitPeriodFigures[] {
  const byBucket = facts.reduce((map, fact) => {
    const bucket = dayBucket(fact.day, grain)
    return map.set(bucket, [...(map.get(bucket) ?? []), fact])
  }, new Map<string, ProfitFact[]>())
  return [...byBucket.keys()].sort().map((bucket) => periodRow(bucket, byBucket.get(bucket) ?? []))
}

/** `report_profit_summary` from raw rows. */
export function profitFigures(input: ProfitRawInput): ProfitFigures {
  return sumProfitFacts(profitFacts(input), input.dishCostsVisible)
}

/** `report_profit_by_period` from raw rows. */
export function profitFiguresByPeriod(input: ProfitRawInput, grain: ProfitGrain): ProfitPeriodFigures[] {
  return sumProfitFactsByPeriod(profitFacts(input), grain)
}

/** `report_expenses_by_category` from raw rows: recorded expenses in the window and branch, per category. */
export function expensesByCategory(input: ProfitRawInput): ExpenseCategoryTotal[] {
  const { scope } = input
  const first = manilaDayOnOrAfter(scope.start)
  const last = manilaDayOnOrAfter(scope.end)
  const categories = new Map(input.categories.map((category) => [category.id, category]))
  const totals = input.expenses
    .filter((expense) => expense.status === 'recorded' && expense.spentOn >= first && expense.spentOn < last && inBranch(scope, expense.outletId))
    .reduce((map, expense) => {
      const category = categories.get(expense.categoryId)
      if (!category) return map
      const current = map.get(category.id) ?? {
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        group: category.group,
        systemKey: category.systemKey,
        cents: 0,
        stockPurchaseCents: 0,
        expenses: 0,
      }
      return map.set(category.id, {
        ...current,
        cents: current.cents + expense.amountCents,
        stockPurchaseCents: current.stockPurchaseCents + (expense.isStockPurchase ? expense.amountCents : 0),
        expenses: current.expenses + 1,
      })
    }, new Map<string, ExpenseCategoryTotal>())
  return [...totals.values()]
}
