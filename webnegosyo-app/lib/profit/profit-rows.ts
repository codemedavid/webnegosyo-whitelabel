/**
 * The profit report functions' rows (supabase/migrations/
 * 20261022120300_report_profit.sql) → the engine's types. The app's port of
 * the web's `src/lib/reports/read/report-profit-rows.ts` (no zod in the app):
 * same fields, same rule — a row without the promised shape fails loudly
 * instead of rendering as ₱0. Pure.
 */

import { EXPENSE_GROUPS, type ExpenseGroup } from "../expenses/types";
import type { ExpenseCategoryTotal, ProfitFigures, ProfitPeriodFigures } from "./profit-types";

type Row = Record<string, unknown>;

function rowsOf(data: unknown): Row[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new Error("A profit report returned something other than rows.");
  return data.map((row) => {
    if (!row || typeof row !== "object") throw new Error("A profit report row is not an object.");
    return row as Row;
  });
}

/** PostgREST sends bigint as a JSON number; a numeric string is accepted too. */
function cents(row: Row, key: string): number {
  const value = row[key];
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw new Error(`${key}: not a whole number (${String(value)})`);
  return number;
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

export function toProfitFigures(data: unknown): ProfitFigures {
  const [row] = rowsOf(data);
  if (!row) throw new Error("report_profit_summary returned no row.");
  if (typeof row.dish_costs_visible !== "boolean") throw new Error("dish_costs_visible: not a boolean");
  return {
    orders: cents(row, "orders"),
    netSalesCents: cents(row, "net_sales_cents"),
    collectedCents: cents(row, "collected_cents"),
    saleMovements: cents(row, "sale_movements"),
    ledgerCogsCents: cents(row, "ledger_cogs_cents"),
    fallbackCogsCents: cents(row, "fallback_cogs_cents"),
    fallbackOrders: cents(row, "fallback_orders"),
    wasteCents: cents(row, "waste_cents"),
    countVarianceCents: cents(row, "count_variance_cents"),
    uncostedMovements: cents(row, "uncosted_movements"),
    soldQuantity: cents(row, "sold_quantity"),
    costedQuantity: cents(row, "costed_quantity"),
    soldDishes: cents(row, "sold_dishes"),
    costedDishes: cents(row, "costed_dishes"),
    dishCostsVisible: row.dish_costs_visible,
    groupCents: {
      ingredients: cents(row, "ingredients_cents"),
      staff: cents(row, "staff_cents"),
      occupancy: cents(row, "occupancy_cents"),
      utilities: cents(row, "utilities_cents"),
      operating: cents(row, "operating_cents"),
      admin: cents(row, "admin_cents"),
      other: cents(row, "other_cents"),
      capex: cents(row, "capex_cents"),
      not_expense: cents(row, "not_expense_cents"),
    },
    ingredientStockCents: cents(row, "ingredient_stock_cents"),
    expenseCount: cents(row, "expense_count"),
    storeWideExpenseCents: cents(row, "store_wide_expense_cents"),
    unsortedPayouts: cents(row, "unsorted_payouts"),
    unsortedPayoutCents: cents(row, "unsorted_payout_cents"),
  };
}

const BUCKET = /^\d{4}-\d{2}-\d{2}$/;

export function toProfitPeriods(data: unknown): ProfitPeriodFigures[] {
  return rowsOf(data)
    .map((row) => {
      const bucket = text(row, "bucket");
      if (!BUCKET.test(bucket)) throw new Error(`bucket: not a date (${bucket})`);
      return {
        bucket,
        orders: cents(row, "orders"),
        netSalesCents: cents(row, "net_sales_cents"),
        collectedCents: cents(row, "collected_cents"),
        saleMovements: cents(row, "sale_movements"),
        ledgerCogsCents: cents(row, "ledger_cogs_cents"),
        fallbackCogsCents: cents(row, "fallback_cogs_cents"),
        wasteCents: cents(row, "waste_cents"),
        countVarianceCents: cents(row, "count_variance_cents"),
        ingredientDirectCents: cents(row, "ingredient_direct_cents"),
        ingredientStockCents: cents(row, "ingredient_stock_cents"),
        expensesCents: cents(row, "expenses_cents"),
        cashOutCents: cents(row, "cash_out_cents"),
      };
    })
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
}

export function toExpenseCategoryTotals(data: unknown): ExpenseCategoryTotal[] {
  return rowsOf(data).map((row) => {
    const group = text(row, "category_group");
    if (!(EXPENSE_GROUPS as readonly string[]).includes(group)) throw new Error(`category_group: unknown (${group})`);
    return {
      categoryId: text(row, "category_id"),
      name: text(row, "name"),
      icon: textOrNull(row, "icon"),
      group: group as ExpenseGroup,
      systemKey: textOrNull(row, "system_key"),
      cents: cents(row, "cents"),
      stockPurchaseCents: cents(row, "stock_purchase_cents"),
      expenses: cents(row, "expenses"),
    };
  });
}
