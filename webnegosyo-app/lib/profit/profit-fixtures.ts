/**
 * Test fixtures for the Profit screen's presentation tests: one report built
 * the way the screen builds it (rows → model), so a test never hand-writes a
 * `ProfitReport` that the model could not produce.
 */

import { buildProfitReport, type ProfitReport } from "./profit-model";
import { toExpenseCategoryTotals, toProfitFigures } from "./profit-rows";

export const SUMMARY_ROW = {
  orders: 10,
  net_sales_cents: 12_460_000,
  collected_cents: 12_460_000,
  sale_movements: 0,
  ledger_cogs_cents: 0,
  fallback_cogs_cents: 0,
  fallback_orders: 0,
  waste_cents: 0,
  count_variance_cents: 0,
  uncosted_movements: 0,
  sold_quantity: 0,
  costed_quantity: 0,
  sold_dishes: 0,
  costed_dishes: 0,
  dish_costs_visible: true,
  ingredients_cents: 4_060_000,
  ingredient_stock_cents: 0,
  staff_cents: 2_616_000,
  occupancy_cents: 1_994_000,
  utilities_cents: 210_000,
  operating_cents: 0,
  admin_cents: 0,
  other_cents: 0,
  capex_cents: 0,
  not_expense_cents: 0,
  expense_count: 6,
  store_wide_expense_cents: 0,
  unsorted_payouts: 0,
  unsorted_payout_cents: 0,
};

export type SummaryRow = typeof SUMMARY_ROW;

export const CATEGORY_ROWS = [
  { category_id: "wages", name: "Salaries & wages", icon: null, category_group: "staff", system_key: "wages", cents: 2_616_000, stock_purchase_cents: 0, expenses: 2 },
  { category_id: "rent", name: "Rent (Upa)", icon: null, category_group: "occupancy", system_key: "rent", cents: 1_994_000, stock_purchase_cents: 0, expenses: 1 },
  { category_id: "power", name: "Electricity", icon: null, category_group: "utilities", system_key: "electricity", cents: 210_000, stock_purchase_cents: 0, expenses: 1 },
];

export function reportWith(overrides: Partial<SummaryRow> = {}, categories: readonly object[] = CATEGORY_ROWS): ProfitReport {
  return buildProfitReport({
    figures: toProfitFigures([{ ...SUMMARY_ROW, ...overrides }]),
    categories: toExpenseCategoryTotals(categories),
    previousCategories: null,
  });
}
