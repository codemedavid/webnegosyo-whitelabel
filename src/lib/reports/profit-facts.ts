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
 *     a sale or void movement counts only while its order is live (an order
 *     cancelled later takes its ingredient cost out with its sales);
 *   * expenses: `status = 'recorded'` and the Manila midnight of `spent_on`
 *     in [start, end) — so a "so far" window ending mid-day keeps today's;
 *   * a branch reads that branch's rows; "unassigned" reads the rows with no
 *     branch (for expenses: the store-wide ones); otherwise everything.
 */

import type { ExpenseGroup } from '@/lib/expenses/types'
import { MIDNIGHT_SCHEDULE, tradingDayOf, tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { toCents } from './money'
import { lineCostCents, movementCostCents, isUsageReason, parseDecimal, type UsageReason } from './cogs'
import { isLiveOrder, orderFigures, type ReportOrder } from './sales-model'
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
  /** stock_movements.id: orders counts written at the same instant. */
  id: string
  reason: string
  /** stock_movements.inventory_item_id: with `outletId`, the shelf that moved. */
  inventoryItemId: string
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
  /**
   * The store's business-day cutoffs (absent / empty = Manila midnight): every
   * fact is dated by its BUSINESS day, as reporting.profit_facts does since
   * 20261027180000.
   */
  schedule?: CutoffSchedule
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

/** The business day of an instant (Manila midnight without a cutoff). SQL: business_day_of. */
export function businessDayOf(ms: number, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): string {
  return tradingDayOf(new Date(ms).toISOString(), schedule)
}

/**
 * The first business day whose START is at or after `ms` (SQL
 * reporting.business_day_on_or_after): an expense dated D is in [start, end)
 * when D's start is. Without a cutoff this is manilaDayOnOrAfter.
 */
export function businessDayOnOrAfter(ms: number, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): string {
  const day = businessDayOf(ms, schedule)
  return Date.parse(tradingDayWindow(day, schedule).startIso) >= ms ? day : addDays(day, 1)
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
      const day = businessDayOf(order.at, input.schedule)
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

/** Reasons that belong to one order: they count only while that order is live, like its sales. */
const ORDER_REASONS: ReadonlySet<string> = new Set(['sale', 'void'])

/** An order id the platform can hold (orders.id is a uuid); others (Convex ids) are never looked up. */
const PLATFORM_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Which ledger movements the report believes. A sale or void belongs to its
 * order (whenever the order was placed: a cancel written in a later window
 * would otherwise move its cost there):
 *
 *   * order found and NOT live (cancelled, refunded, voided, negative): the
 *     movement never happened for the report — no ingredient cost, and it
 *     did not "move the shelf" for the stock-count rules (a sale and its void
 *     net to nothing);
 *   * order NOT found (deleted from Settings → Delete orders, which keeps the
 *     ledger; or unreadable for the caller): the stock really left the shelf,
 *     so the count rules still see it, but its ingredient cost goes with its
 *     sales (comes back if the order is restored). Ids that are not the
 *     platform's (Convex) are never looked up and always count.
 *
 * SQL: reporting.counts_on_shelf (shelf) and profit_facts `live_ids` (cost).
 */
function ledgerViews(input: Pick<ProfitRawInput, 'orders' | 'movements'>): { shelf: readonly LedgerMovement[]; costed: readonly LedgerMovement[] } {
  const isLive = new Map(input.orders.map((order) => [order.id, isLiveOrder(order)]))
  const liveness = (move: LedgerMovement): boolean | undefined =>
    !ORDER_REASONS.has(move.reason) || move.orderId === null ? true : isLive.get(move.orderId)
  const shelf = input.movements.filter((move) => liveness(move) !== false)
  const costed = shelf.filter((move) => liveness(move) === true || !PLATFORM_ORDER_ID.test(move.orderId ?? ''))
  return { shelf, costed }
}

/** Movements that put stock on a shelf the ledger can trust: the first of them is the shelf's baseline. */
const BASELINE_REASONS: ReadonlySet<string> = new Set(['stocktake', 'receive', 'transfer_in'])

function isSameShelf(a: LedgerMovement, b: LedgerMovement): boolean {
  return a.inventoryItemId === b.inventoryItemId && a.outletId === b.outletId
}

/**
 * An OPENING count sets a shelf up; it does not measure it. The shelf's
 * baseline is its first count, delivery or transfer in (the count itself when
 * nothing came before, e.g. a shelf that sold before it was ever counted). A
 * count on the baseline's business day with no sale from the shelf in between
 * is the opening count or a fix to it ("500" typed for "10", corrected an hour
 * later). Its delta is stock the ledger never knew about, not stock that went
 * missing or turned up, so it is no ingredient cost. A count on a later day,
 * or after the shelf sold, measures it. `ledger` = every movement the caller
 * can see, any time. SQL: reporting.profit_facts `openings`.
 */
export function isOpeningCount(move: LedgerMovement, ledger: readonly LedgerMovement[], schedule?: CutoffSchedule): boolean {
  if (move.reason !== 'stocktake') return false
  const shelf = ledger.filter((other) => isSameShelf(other, move))
  const baselineAt = shelf
    .filter((other) => BASELINE_REASONS.has(other.reason) && other.at <= move.at)
    .reduce((earliest, other) => Math.min(earliest, other.at), move.at)
  if (businessDayOf(baselineAt, schedule) !== businessDayOf(move.at, schedule)) return false
  return !shelf.some((other) => other.reason === 'sale' && other.at > baselineAt && other.at < move.at)
}

interface ShelfWalk {
  /** Losses on the shelf not yet given back, centavos. */
  balance: number
  costs: [LedgerMovement, number | null][]
}

const byTimeThenId = (a: LedgerMovement, b: LedgerMovement): number => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Back-to-back counts of a shelf (nothing else moved it in between) are ONE
 * recount: "2,997.51" typed and fixed to "0.51" nine seconds later.
 */
function recounts(counts: readonly LedgerMovement[], others: readonly LedgerMovement[]): LedgerMovement[][] {
  return counts.reduce<LedgerMovement[][]>((runs, count) => {
    const run = runs[runs.length - 1]
    const previous = run?.[run.length - 1]
    const isRecount = previous !== undefined && !others.some((other) => other.at > previous.at && other.at < count.at)
    return isRecount ? [...runs.slice(0, -1), [...run, count]] : [...runs, [count]]
  }, [])
}

/** How soon after a delivery a count can still be a fix to it ("4000" kg typed, fixed 2 minutes later). */
export const DELIVERY_FIX_WINDOW_MS = 30 * 60 * 1000

/**
 * The deliveries a count may undo: receives written in the
 * DELIVERY_FIX_WINDOW_MS before it with nothing else on the shelf in between
 * (no sale, waste, transfer or other count). SQL: reporting.profit_facts
 * `delivered`.
 */
function deliveredBefore(count: LedgerMovement, shelf: readonly LedgerMovement[]): string {
  const earlier = shelf.filter((move) => move.at < count.at)
  const stopAt = earlier.filter((move) => move.reason !== 'receive').reduce((latest, move) => Math.max(latest, move.at), Number.NEGATIVE_INFINITY)
  const since = Math.max(stopAt, count.at - DELIVERY_FIX_WINDOW_MS - 1)
  return sumDecimals(earlier.filter((move) => move.reason === 'receive' && move.at > since).map((move) => move.quantityDelta))
}

/** Σ numerics, exactly (quantities have four decimals; floats would drift). */
function sumDecimals(values: readonly Numeric[]): string {
  const parts = values.map(parseDecimal).filter((part) => part !== null)
  const scale = parts.reduce((widest, part) => Math.max(widest, part.scale), 0)
  const ten = BigInt(10)
  const units = parts.reduce((sum, part) => sum + part.units * ten ** BigInt(scale - part.scale), BigInt(0))
  if (scale === 0) return units.toString()
  const sign = units < BigInt(0) ? '-' : ''
  const digits = (units < BigInt(0) ? -units : units).toString().padStart(scale + 1, '0')
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/**
 * One recount: its last costed count carries the step, the rest cost 0, an
 * uncosted one stays null. A recount that UNDOES the delivery straight before
 * it is no loss: it finds 99-100% of the delivered quantity missing (at the
 * carrier's cost), i.e. at most 1% of what was typed ever arrived — "4000" kg
 * typed for 4000 g (a unit slip leaves 0.1%), or a delivery entered by
 * mistake and counted back out. Anything else measures the shelf as before:
 * a count that finds only part of a delivery is just as likely old stock gone
 * (Sofia's Kitchen counted 25 chickens right after receiving 25 with 23 on
 * the shelf), and a bigger shortfall is stock used by counting it down.
 */
function walkRecount(shelf: readonly LedgerMovement[]) {
  return (walk: ShelfWalk, run: readonly LedgerMovement[]): ShelfWalk => {
    const priced = run.map((count) => [count, movementCostCents(count.quantityDelta, count.unitCost)] as const)
    const costed = priced.filter(([, cents]) => cents !== null)
    if (costed.length === 0) return { ...walk, costs: [...walk.costs, ...priced.map(([count]): [LedgerMovement, null] => [count, null])] }
    const carrier = costed[costed.length - 1][0]
    const found = costed.reduce((sum, [, cents]) => sum + (cents ?? 0), 0)
    const delivered = deliveredBefore(run[0], shelf)
    const deliveredCents = -(movementCostCents(delivered, carrier.unitCost) ?? 0)
    const corrected = found > 0 && found <= deliveredCents && found * 100 >= deliveredCents * 99 ? found : 0
    const balance = Math.max(0, walk.balance + found - corrected)
    const step = balance - walk.balance + 0
    return {
      balance,
      costs: [...walk.costs, ...priced.map(([count, cents]): [LedgerMovement, number | null] => [count, cents === null ? null : count === carrier ? step : 0])],
    }
  }
}

/**
 * What each count that measures its shelf (not an opening count) costs.
 * Back-to-back counts are one recount (`recounts`). A recount that finds less
 * is a loss, unless it undoes the delivery written just before it
 * (`walkRecount`). One that finds more gives back what the shelf's earlier
 * counts took, never more: stock beyond that arrived without a delivery being
 * recorded (a store that restocks by counting), and the sales that used it
 * were already costed. So the shelf keeps a balance of losses not yet given
 * back, in centavos at each count's frozen cost, over its counts written
 * before `end` (earlier windows included; nothing written later, so a closed
 * window's figure never changes), in time then id order. `ledger` = the
 * movements on the shelf (`ledgerViews`).
 * SQL: reporting.profit_facts `measured` .. `walked`.
 */
function countCosts(ledger: readonly LedgerMovement[], end: number, schedule?: CutoffSchedule): ReadonlyMap<LedgerMovement, number | null> {
  // Everything a count's cost depends on was written before it, so `end` bounds the read.
  const shelves = ledger
    .filter((move) => move.at < end)
    .reduce((map, move) => {
      const key = `${move.inventoryItemId}|${move.outletId ?? ''}`
      return map.set(key, [...(map.get(key) ?? []), move])
    }, new Map<string, LedgerMovement[]>())
  return new Map(
    [...shelves.values()].flatMap((shelf) => {
      const counts = shelf.filter((move) => move.reason === 'stocktake' && !isOpeningCount(move, shelf, schedule))
      const others = shelf.filter((move) => move.reason !== 'stocktake')
      return recounts([...counts].sort(byTimeThenId), others).reduce<ShelfWalk>(walkRecount(shelf), { balance: 0, costs: [] }).costs
    }),
  )
}

function movementFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  const ledger = ledgerViews(input)
  const counted = countCosts(ledger.shelf, scope.end, input.schedule)
  return ledger.costed.flatMap((move): ProfitFact[] => {
    if (!isUsageReason(move.reason) || !inWindow(scope, move.at) || !inBranch(scope, move.outletId)) return []
    if (move.reason === 'stocktake' && !counted.has(move)) return []
    const cents = move.reason === 'stocktake' ? (counted.get(move) ?? null) : movementCostCents(move.quantityDelta, move.unitCost)
    return [{ kind: 'movement', day: businessDayOf(move.at, input.schedule), reason: move.reason, cents }]
  })
}

function expenseFacts(input: ProfitRawInput): ProfitFact[] {
  const { scope } = input
  const first = businessDayOnOrAfter(scope.start, input.schedule)
  const last = businessDayOnOrAfter(scope.end, input.schedule)
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
    // Any status (contract §10): a voided drawer expense put the cash back with a pay_in and is never re-filed.
    input.expenses.filter((expense) => expense.shiftCashMovementId !== null).map((expense) => expense.shiftCashMovementId),
  )
  return input.payouts.flatMap((payout): ProfitFact[] => {
    if (payout.kind !== 'pay_out' || sorted.has(payout.id)) return []
    if (!inWindow(scope, payout.at) || !inBranch(scope, payout.outletId)) return []
    return [{ kind: 'payout', day: businessDayOf(payout.at, input.schedule), cents: toCents(payout.amount) }]
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
  const first = businessDayOnOrAfter(scope.start, input.schedule)
  const last = businessDayOnOrAfter(scope.end, input.schedule)
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
