/**
 * Profit (Kita): the one definition. Pure; money is integer centavos.
 *
 *   Profit = Net sales − Ingredient cost − Expenses
 *
 * Net sales
 *   The sales model's net (sales-model.ts `orderFigures().netCents`, summed
 *   over LIVE orders; SQL `reporting.order_figures`). Never a new formula.
 *
 * Does the store track stock?
 *   Yes when the window (and branch) has at least one `sale` stock movement.
 *
 * Recipe COGS = ledger COGS + fallback COGS
 *   ledger   Σ over `sale` and `void` movements created in the window of
 *            −quantity_delta × unit_cost (the cost the ledger FROZE at the
 *            time, never today's), rounded per movement. A movement with no
 *            cost adds nothing and is counted as uncosted (coverage).
 *   fallback for each live order in the window that has NO `sale` movement
 *            at all (any time): Σ its lines' dish cost at sale
 *            (`order_item_costs.unit_cost`) × quantity.
 *   Each order is costed ONCE: an order with any `sale` movement is costed
 *   only by the ledger, every other live order only by its dish costs. A
 *   cancelled order is never in the fallback; its void movement gives back
 *   exactly what its sale took (same frozen cost), so voids never count.
 *
 * Losses (shown as their own line, included by default)
 *   waste movements + stock-count variance, both at frozen cost. A count that
 *   finds LESS than the ledger expected is a loss; one that finds more gives
 *   it back (net variance: ingredient cost is what was really used up).
 *
 * Ingredient cost (Sangkap)
 *   tracks stock   recipe COGS + losses + ingredients-group expenses that did
 *                  NOT go into stock (`is_stock_purchase = false`, e.g. ice).
 *                  Purchases that went into stock appear in Cash flow only:
 *                  the ledger already counts them as they are used.
 *   doesn't track  every ingredients-group expense (basis "purchases"),
 *                  labelled an estimate: what was bought, not what was used.
 *
 * Expenses (Gastos)
 *   Recorded expenses in staff, occupancy, utilities, operating, admin,
 *   other, by `spent_on` (Manila) in the window. Capex ("big purchase") and
 *   not_expense (owner took cash, deposits, loans) are shown apart and never
 *   change profit.
 *
 * Ratios (null when net sales ≤ 0): food % = ingredient / net, staff %,
 * rent % (occupancy), prime % = (ingredient + staff) / net, profit %.
 *
 * Cash flow: in = collected (the payment buckets' total); out = every
 * recorded expense, all groups, stock purchases, capex and not_expense
 * included. Unsorted drawer pay-outs are listed beside it, not in it.
 *
 * The SQL twin is supabase/migrations/20261022120300_report_profit.sql (via
 * profit-facts.ts); the parity suite holds them equal to the centavo.
 */

import type { ExpenseGroup } from '../expenses/types'
import { EXPENSE_LINE_GROUPS, type ExpenseCategoryTotal, type ProfitFigures, type ProfitPeriodFigures } from './profit-types'

export type IngredientBasis = 'recipes' | 'purchases'

/** Above this share of dishes sold without a cost, the ingredient figure is flagged. */
export const UNCOSTED_SHARE_LIMIT = 0.1
/** Categories an owner pays every period; missing one now (but not last time) is flagged. */
export const RECURRING_SYSTEM_KEYS = ['rent', 'electricity', 'water', 'wages'] as const
/** Prime cost most food businesses land in (plan §5.3). */
export const PRIME_COST_BAND = { low: 0.55, high: 0.65 } as const

export interface ProfitRatios {
  profit: number | null
  food: number | null
  staff: number | null
  rent: number | null
  prime: number | null
}

export interface ProfitCoverage {
  /** False for branch-locked accounts: dish costs at sale are store-wide reads. */
  dishCostsVisible: boolean
  soldQuantity: number
  costedQuantity: number
  /** Share of dishes sold (by quantity) that had a cost; null with nothing sold or costs hidden. */
  costedShare: number | null
  soldDishes: number
  uncostedDishes: number
  uncostedMovements: number
  fallbackOrders: number
}

export interface CashFlowLine {
  key: 'ingredients_stock' | 'ingredients_direct' | Exclude<ExpenseGroup, 'ingredients'>
  cents: number
}

export interface CashFlow {
  inCents: number
  outCents: number
  netCents: number
  out: CashFlowLine[]
  unsortedPayouts: number
  unsortedPayoutCents: number
}

export type ProfitFinding =
  | { kind: 'missing_recurring'; severity: 'warning'; categoryId: string; categoryName: string; systemKey: string; previousCents: number }
  | { kind: 'uncosted_dishes'; severity: 'warning'; uncostedDishes: number; uncostedShare: number }
  | { kind: 'unsorted_payouts'; severity: 'warning'; count: number; cents: number }
  | { kind: 'no_expenses'; severity: 'warning' }
  | { kind: 'ingredient_estimate'; severity: 'info' }
  | { kind: 'uncosted_movements'; severity: 'info'; count: number }
  | { kind: 'dish_costs_hidden'; severity: 'info' }
  | { kind: 'store_wide_excluded'; severity: 'info'; cents: number }

export interface ProfitReport {
  netSalesCents: number
  collectedCents: number
  orders: number
  ingredientCostCents: number
  ingredientBasis: IngredientBasis
  recipeCogsCents: number
  ledgerCogsCents: number
  fallbackCogsCents: number
  lossesCents: number
  wasteCents: number
  countVarianceCents: number
  /** Tracks stock: ingredient expenses that did not go into stock. Otherwise every ingredient expense. */
  directIngredientCents: number
  expensesCents: number
  byGroup: Readonly<Record<ExpenseGroup, number>>
  /** Expense categories (the six expense groups), largest first; Σ cents = expensesCents. */
  byCategory: ExpenseCategoryTotal[]
  profitCents: number
  ratios: ProfitRatios
  coverage: ProfitCoverage
  capexCents: number
  notExpenseCents: number
  cashFlow: CashFlow
  findings: ProfitFinding[]
}

export interface BuildProfitReportInput {
  figures: ProfitFigures
  categories: readonly ExpenseCategoryTotal[]
  /** The previous period's categories (null = unknown: no "missing" findings). */
  previousCategories: readonly ExpenseCategoryTotal[] | null
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

export function ingredientBasisOf(saleMovements: number): IngredientBasis {
  return saleMovements > 0 ? 'recipes' : 'purchases'
}

interface IngredientParts {
  netSalesCents: number
  ledgerCogsCents: number
  fallbackCogsCents: number
  wasteCents: number
  countVarianceCents: number
  ingredientAllCents: number
  ingredientStockCents: number
  expensesCents: number
}

interface IngredientResult {
  recipeCogsCents: number
  lossesCents: number
  directIngredientCents: number
  ingredientCostCents: number
  profitCents: number
}

/** The sentence card's arithmetic, shared by the summary and every trend bucket. */
export function ingredientAndProfit(parts: IngredientParts, basis: IngredientBasis): IngredientResult {
  const recipeCogsCents = parts.ledgerCogsCents + parts.fallbackCogsCents
  const lossesCents = parts.wasteCents + parts.countVarianceCents
  const directIngredientCents = basis === 'recipes' ? parts.ingredientAllCents - parts.ingredientStockCents : parts.ingredientAllCents
  const ingredientCostCents = basis === 'recipes' ? recipeCogsCents + lossesCents + directIngredientCents : directIngredientCents
  return {
    recipeCogsCents,
    lossesCents,
    directIngredientCents,
    ingredientCostCents,
    profitCents: parts.netSalesCents - ingredientCostCents - parts.expensesCents,
  }
}

function byCentsThenName(a: ExpenseCategoryTotal, b: ExpenseCategoryTotal): number {
  return b.cents - a.cents || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.categoryId < b.categoryId ? -1 : 1)
}

function coverageOf(figures: ProfitFigures): ProfitCoverage {
  const isVisible = figures.dishCostsVisible
  return {
    dishCostsVisible: isVisible,
    soldQuantity: figures.soldQuantity,
    costedQuantity: figures.costedQuantity,
    costedShare: isVisible && figures.soldQuantity > 0 ? figures.costedQuantity / figures.soldQuantity : null,
    soldDishes: figures.soldDishes,
    uncostedDishes: figures.soldDishes - figures.costedDishes,
    uncostedMovements: figures.uncostedMovements,
    fallbackOrders: figures.fallbackOrders,
  }
}

function cashFlowOf(figures: ProfitFigures): CashFlow {
  const groups = figures.groupCents
  const out: CashFlowLine[] = [
    { key: 'ingredients_stock', cents: figures.ingredientStockCents },
    { key: 'ingredients_direct', cents: groups.ingredients - figures.ingredientStockCents },
    ...EXPENSE_LINE_GROUPS.map((group) => ({ key: group, cents: groups[group] })),
    { key: 'capex', cents: groups.capex },
    { key: 'not_expense', cents: groups.not_expense },
  ]
  const outCents = sum(out.map((line) => line.cents))
  return {
    inCents: figures.collectedCents,
    outCents,
    netCents: figures.collectedCents - outCents,
    out,
    unsortedPayouts: figures.unsortedPayouts,
    unsortedPayoutCents: figures.unsortedPayoutCents,
  }
}

/** Rent/power/water/wages paid in the previous period but not (yet) in this one. */
export function missingRecurring(
  current: readonly ExpenseCategoryTotal[],
  previous: readonly ExpenseCategoryTotal[],
): Extract<ProfitFinding, { kind: 'missing_recurring' }>[] {
  const keys: readonly string[] = RECURRING_SYSTEM_KEYS
  const paidNow = new Set(current.filter((row) => row.cents > 0 && row.systemKey).map((row) => row.systemKey))
  return previous
    .filter((row) => row.systemKey !== null && keys.includes(row.systemKey) && row.cents > 0 && !paidNow.has(row.systemKey))
    .sort((a, b) => keys.indexOf(a.systemKey ?? '') - keys.indexOf(b.systemKey ?? ''))
    .map((row) => ({
      kind: 'missing_recurring',
      severity: 'warning',
      categoryId: row.categoryId,
      categoryName: row.name,
      systemKey: row.systemKey ?? '',
      previousCents: row.cents,
    }))
}

interface FindingInput {
  figures: ProfitFigures
  basis: IngredientBasis
  coverage: ProfitCoverage
  categories: readonly ExpenseCategoryTotal[]
  previousCategories: readonly ExpenseCategoryTotal[] | null
}

/** The trust strip: what to fix before believing the number. Warnings first. */
export function profitFindings({ figures, basis, coverage, categories, previousCategories }: FindingInput): ProfitFinding[] {
  const uncostedShare = coverage.costedShare === null ? null : 1 - coverage.costedShare
  const findings: Array<ProfitFinding | null> = [
    ...(previousCategories ? missingRecurring(categories, previousCategories) : []),
    figures.expenseCount === 0 ? { kind: 'no_expenses', severity: 'warning' } : null,
    basis === 'recipes' && uncostedShare !== null && uncostedShare > UNCOSTED_SHARE_LIMIT
      ? { kind: 'uncosted_dishes', severity: 'warning', uncostedDishes: coverage.uncostedDishes, uncostedShare }
      : null,
    figures.unsortedPayouts > 0
      ? { kind: 'unsorted_payouts', severity: 'warning', count: figures.unsortedPayouts, cents: figures.unsortedPayoutCents }
      : null,
    basis === 'purchases' ? { kind: 'ingredient_estimate', severity: 'info' } : null,
    basis === 'recipes' && figures.uncostedMovements > 0
      ? { kind: 'uncosted_movements', severity: 'info', count: figures.uncostedMovements }
      : null,
    basis === 'recipes' && !figures.dishCostsVisible ? { kind: 'dish_costs_hidden', severity: 'info' } : null,
    figures.storeWideExpenseCents > 0 ? { kind: 'store_wide_excluded', severity: 'info', cents: figures.storeWideExpenseCents } : null,
  ]
  return findings.filter((finding): finding is ProfitFinding => finding !== null)
}

export function buildProfitReport({ figures, categories, previousCategories }: BuildProfitReportInput): ProfitReport {
  const basis = ingredientBasisOf(figures.saleMovements)
  const groups = figures.groupCents
  const expensesCents = sum(EXPENSE_LINE_GROUPS.map((group) => groups[group]))
  const result = ingredientAndProfit(
    {
      netSalesCents: figures.netSalesCents,
      ledgerCogsCents: figures.ledgerCogsCents,
      fallbackCogsCents: figures.fallbackCogsCents,
      wasteCents: figures.wasteCents,
      countVarianceCents: figures.countVarianceCents,
      ingredientAllCents: groups.ingredients,
      ingredientStockCents: figures.ingredientStockCents,
      expensesCents,
    },
    basis,
  )
  const expenseGroups: readonly ExpenseGroup[] = EXPENSE_LINE_GROUPS
  const byCategory = categories.filter((row) => expenseGroups.includes(row.group) && row.cents !== 0).sort(byCentsThenName)
  const coverage = coverageOf(figures)
  const net = figures.netSalesCents
  return {
    netSalesCents: net,
    collectedCents: figures.collectedCents,
    orders: figures.orders,
    ingredientCostCents: result.ingredientCostCents,
    ingredientBasis: basis,
    recipeCogsCents: result.recipeCogsCents,
    ledgerCogsCents: figures.ledgerCogsCents,
    fallbackCogsCents: figures.fallbackCogsCents,
    lossesCents: result.lossesCents,
    wasteCents: figures.wasteCents,
    countVarianceCents: figures.countVarianceCents,
    directIngredientCents: result.directIngredientCents,
    expensesCents,
    byGroup: groups,
    byCategory,
    profitCents: result.profitCents,
    ratios: {
      profit: ratio(result.profitCents, net),
      food: ratio(result.ingredientCostCents, net),
      staff: ratio(groups.staff, net),
      rent: ratio(groups.occupancy, net),
      prime: ratio(result.ingredientCostCents + groups.staff, net),
    },
    coverage,
    capexCents: groups.capex,
    notExpenseCents: groups.not_expense,
    cashFlow: cashFlowOf(figures),
    findings: profitFindings({ figures, basis, coverage, categories, previousCategories }),
  }
}

export interface ProfitTrendPoint {
  bucket: string
  netSalesCents: number
  ingredientCostCents: number
  expensesCents: number
  profitCents: number
  cashInCents: number
  cashOutCents: number
}

/**
 * One point per bucket key (zero-filled), with the WINDOW's ingredient basis
 * so the points add up to the summary exactly.
 */
export function profitTrend(keys: readonly string[], rows: readonly ProfitPeriodFigures[], basis: IngredientBasis): ProfitTrendPoint[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]))
  return keys.map((bucket) => {
    const row = byBucket.get(bucket)
    if (!row) {
      return { bucket, netSalesCents: 0, ingredientCostCents: 0, expensesCents: 0, profitCents: 0, cashInCents: 0, cashOutCents: 0 }
    }
    const result = ingredientAndProfit(
      {
        netSalesCents: row.netSalesCents,
        ledgerCogsCents: row.ledgerCogsCents,
        fallbackCogsCents: row.fallbackCogsCents,
        wasteCents: row.wasteCents,
        countVarianceCents: row.countVarianceCents,
        ingredientAllCents: row.ingredientDirectCents + row.ingredientStockCents,
        ingredientStockCents: row.ingredientStockCents,
        expensesCents: row.expensesCents,
      },
      basis,
    )
    return {
      bucket,
      netSalesCents: row.netSalesCents,
      ingredientCostCents: result.ingredientCostCents,
      expensesCents: row.expensesCents,
      profitCents: result.profitCents,
      cashInCents: row.collectedCents,
      cashOutCents: row.cashOutCents,
    }
  })
}
