/**
 * The profit report functions' row types, copied VERBATIM from the web's
 * `src/lib/reports/profit-facts.ts` (which also holds the SQL twin's fact
 * engine — far too much for a phone, and it needs the sales model). Only the
 * declarations the app reads are here; `tests/unit/reports/profit-app-parity.test.ts`
 * fails if any of them drifts from the web's text.
 */

import type { ExpenseGroup } from '../expenses/types'

export const PROFIT_GRAINS = ['day', 'week', 'month'] as const
export type ProfitGrain = (typeof PROFIT_GRAINS)[number]

/** The groups that make up "Expenses" (Gastos): everything operating except ingredients. */
export const EXPENSE_LINE_GROUPS = ['staff', 'occupancy', 'utilities', 'operating', 'admin', 'other'] as const satisfies readonly ExpenseGroup[]

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
