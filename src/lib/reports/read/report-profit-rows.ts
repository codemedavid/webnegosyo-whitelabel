/**
 * The profit report functions' rows (supabase/migrations/
 * 20261022120300_report_profit.sql) → the engine's types (profit-facts.ts).
 *
 * Pure and validated, like report-rpc-rows.ts: a row without the promised
 * shape fails loudly instead of rendering as ₱0. The parity suite runs these
 * mappers over the real SQL, so what it proves is what the page shows.
 */

import { z } from 'zod'
import { EXPENSE_GROUPS } from '@/lib/expenses/types'
import type { ExpenseCategoryTotal, ProfitFigures, ProfitPeriodFigures } from '../profit-facts'

/** PostgREST sends bigint as a JSON number; a numeric string is accepted too. */
const cents = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: 'custom', message: `not a whole number: ${value}` })
    return z.NEVER
  }
  return number
})

const summaryRow = z.object({
  orders: cents,
  net_sales_cents: cents,
  collected_cents: cents,
  sale_movements: cents,
  ledger_cogs_cents: cents,
  fallback_cogs_cents: cents,
  fallback_orders: cents,
  waste_cents: cents,
  count_variance_cents: cents,
  uncosted_movements: cents,
  sold_quantity: cents,
  costed_quantity: cents,
  sold_dishes: cents,
  costed_dishes: cents,
  dish_costs_visible: z.boolean(),
  ingredients_cents: cents,
  ingredient_stock_cents: cents,
  staff_cents: cents,
  occupancy_cents: cents,
  utilities_cents: cents,
  operating_cents: cents,
  admin_cents: cents,
  other_cents: cents,
  capex_cents: cents,
  not_expense_cents: cents,
  expense_count: cents,
  store_wide_expense_cents: cents,
  unsorted_payouts: cents,
  unsorted_payout_cents: cents,
})

const periodRow = z.object({
  bucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orders: cents,
  net_sales_cents: cents,
  collected_cents: cents,
  sale_movements: cents,
  ledger_cogs_cents: cents,
  fallback_cogs_cents: cents,
  waste_cents: cents,
  count_variance_cents: cents,
  ingredient_direct_cents: cents,
  ingredient_stock_cents: cents,
  expenses_cents: cents,
  cash_out_cents: cents,
})

const categoryRow = z.object({
  category_id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  category_group: z.enum(EXPENSE_GROUPS),
  system_key: z.string().nullable(),
  cents,
  stock_purchase_cents: cents,
  expenses: cents,
})

function rowsOf(data: unknown): unknown[] {
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) throw new Error('A profit report returned something other than rows.')
  return data
}

export function toProfitFigures(data: unknown): ProfitFigures {
  const [first] = rowsOf(data)
  if (first === undefined) throw new Error('report_profit_summary returned no row.')
  const row = summaryRow.parse(first)
  return {
    orders: row.orders,
    netSalesCents: row.net_sales_cents,
    collectedCents: row.collected_cents,
    saleMovements: row.sale_movements,
    ledgerCogsCents: row.ledger_cogs_cents,
    fallbackCogsCents: row.fallback_cogs_cents,
    fallbackOrders: row.fallback_orders,
    wasteCents: row.waste_cents,
    countVarianceCents: row.count_variance_cents,
    uncostedMovements: row.uncosted_movements,
    soldQuantity: row.sold_quantity,
    costedQuantity: row.costed_quantity,
    soldDishes: row.sold_dishes,
    costedDishes: row.costed_dishes,
    dishCostsVisible: row.dish_costs_visible,
    groupCents: {
      ingredients: row.ingredients_cents,
      staff: row.staff_cents,
      occupancy: row.occupancy_cents,
      utilities: row.utilities_cents,
      operating: row.operating_cents,
      admin: row.admin_cents,
      other: row.other_cents,
      capex: row.capex_cents,
      not_expense: row.not_expense_cents,
    },
    ingredientStockCents: row.ingredient_stock_cents,
    expenseCount: row.expense_count,
    storeWideExpenseCents: row.store_wide_expense_cents,
    unsortedPayouts: row.unsorted_payouts,
    unsortedPayoutCents: row.unsorted_payout_cents,
  }
}

export function toProfitPeriods(data: unknown): ProfitPeriodFigures[] {
  return rowsOf(data)
    .map((raw) => periodRow.parse(raw))
    .map((row) => ({
      bucket: row.bucket,
      orders: row.orders,
      netSalesCents: row.net_sales_cents,
      collectedCents: row.collected_cents,
      saleMovements: row.sale_movements,
      ledgerCogsCents: row.ledger_cogs_cents,
      fallbackCogsCents: row.fallback_cogs_cents,
      wasteCents: row.waste_cents,
      countVarianceCents: row.count_variance_cents,
      ingredientDirectCents: row.ingredient_direct_cents,
      ingredientStockCents: row.ingredient_stock_cents,
      expensesCents: row.expenses_cents,
      cashOutCents: row.cash_out_cents,
    }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
}

export function toExpenseCategoryTotals(data: unknown): ExpenseCategoryTotal[] {
  return rowsOf(data)
    .map((raw) => categoryRow.parse(raw))
    .map((row) => ({
      categoryId: row.category_id,
      name: row.name,
      icon: row.icon,
      group: row.category_group,
      systemKey: row.system_key,
      cents: row.cents,
      stockPurchaseCents: row.stock_purchase_cents,
      expenses: row.expenses,
    }))
}
