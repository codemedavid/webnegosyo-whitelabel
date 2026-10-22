/**
 * What the Profit screen decides around the shared model (the web's
 * `src/lib/reports/profit-view.ts`, ported for the phone): who may see it,
 * the words of the trust strip — and, instead of web links, what each row's
 * action opens in the app. Money reads like the web's report figures: whole
 * pesos, a real minus sign. Pure.
 */

import type { ExpenseGroup } from "../expenses/types";
import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import type { CashFlowLine, ProfitFinding, ProfitReport } from "./profit-model";

export const PROFIT_LOCKED_MESSAGE = "Ask the owner for cost access to see profit.";
export const PROFIT_PLATFORM_ONLY_MESSAGE =
  "Profit is ready for stores on the new order system. Ask WebNegosyo support to move your store over.";

const MINUS = "−";

/** "₱1,250" / "−₱3,200": whole pesos, like the web report figures. */
export function formatMoney(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  const pesos = Math.round(Math.abs(cents) / 100);
  const text = `₱${String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  return cents < 0 && pesos !== 0 ? `${MINUS}${text}` : text;
}

/** "44%" — the web's `formatRatio` (0 digits). "—" when unknown. */
export function formatRatio(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  const text = `${(Math.abs(ratio) * 100).toFixed(0)}%`;
  return ratio < 0 && Number(text.slice(0, -1)) !== 0 ? `${MINUS}${text}` : text;
}

/**
 * Profit needs `reports` (the tab's gate and the report RPCs' key) plus
 * `expenses` and `costs`. The database refuses the same callers
 * (reporting.assert_profit_access), so this only decides what the screen says
 * first — and keeps a row from opening onto a lock screen.
 */
export function canSeeProfit(holder: StaffPermissionHolder): boolean {
  return hasPermission(holder, "reports") && hasPermission(holder, "expenses") && hasPermission(holder, "costs");
}

export type FindingAction =
  | { kind: "record"; label: string; categoryId: string }
  | { kind: "add"; label: string }
  | { kind: "sort"; label: string }
  | { kind: "recipes"; label: string }
  /** A bill with an unpaid due date (lib/profit/profit-bills.ts); opens that bill. */
  | { kind: "bill"; label: string; billId: string };

export interface FindingRow {
  key: string;
  tone: "warning" | "info";
  text: string;
  action: FindingAction | null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One trust-strip row per finding, in the web's words; each warning says what to do. */
export function findingRow(finding: ProfitFinding, periodPhrase: string): FindingRow {
  switch (finding.kind) {
    case "missing_recurring":
      return {
        key: `missing:${finding.categoryId}`,
        tone: "warning",
        text: `No ${finding.categoryName} recorded ${periodPhrase}. Profit looks higher than it is.`,
        action: { kind: "record", label: "Record", categoryId: finding.categoryId },
      };
    case "no_expenses":
      return {
        key: "no_expenses",
        tone: "warning",
        text: `No expenses recorded ${periodPhrase}. Empty can mean missing, so this profit is too high until they are in.`,
        action: { kind: "add", label: "Add expense" },
      };
    case "uncosted_dishes":
      return {
        key: "uncosted_dishes",
        tone: "warning",
        text: `Ingredient cost is estimated: ${plural(finding.uncostedDishes, "dish has", "dishes have")} no recipe (${formatRatio(finding.uncostedShare)} of what sold).`,
        action: { kind: "recipes", label: "Add recipes" },
      };
    case "unsorted_payouts":
      return {
        key: "unsorted_payouts",
        tone: "warning",
        text: `${plural(finding.count, "drawer pay-out", "drawer pay-outs")} (${formatMoney(finding.cents)}) not sorted yet, so not in Expenses.`,
        action: { kind: "sort", label: "Sort" },
      };
    case "ingredient_estimate":
      return {
        key: "ingredient_estimate",
        tone: "info",
        text: "Ingredients are an estimate: based on what you bought, not what you used.",
        action: null,
      };
    case "uncosted_movements":
      return {
        key: "uncosted_movements",
        tone: "info",
        text: `${plural(finding.count, "stock movement has", "stock movements have")} no cost recorded, so ${finding.count === 1 ? "it adds" : "they add"} nothing to ingredients.`,
        action: null,
      };
    case "dish_costs_hidden":
      return {
        key: "dish_costs_hidden",
        tone: "info",
        text: "Ingredients here count your branch’s stock use only. Dish costs for sales without stock records are visible to store-wide accounts.",
        action: null,
      };
    case "store_wide_excluded":
      return {
        key: "store_wide_excluded",
        tone: "info",
        text: `${formatMoney(finding.cents)} of store-wide costs (not tied to a branch) are left out of this branch’s profit.`,
        action: null,
      };
  }
}

/** The phrase findings use: "this month yet" while it is still running. */
export function findingPhrase(phrase: string, isPartial: boolean): string {
  return isPartial ? `${phrase} yet` : phrase;
}

export const CASH_OUT_LABELS: Readonly<Record<CashFlowLine["key"], string>> = {
  ingredients_stock: "Stock purchases",
  ingredients_direct: "Ingredients (not stocked)",
  staff: "Staff",
  occupancy: "Rent",
  utilities: "Utilities",
  operating: "Operating",
  admin: "Admin & permits",
  other: "Other",
  capex: "Big purchases (equipment)",
  not_expense: "Not expenses (owner took cash, deposits, loans)",
};

/** The ⓘ line under Ingredients: how it was worked out, and how much of it is real. */
export function ingredientBasisLine(report: ProfitReport): string {
  if (report.ingredientBasis === "purchases") return "Estimate: based on what you bought, not what you used.";
  const share =
    report.coverage.costedShare === null
      ? "Dish coverage is visible to store-wide accounts."
      : `${formatRatio(report.coverage.costedShare)} of dishes sold had a cost.`;
  return `From your recipes, at what each ingredient cost when it was used. ${share}`;
}

/** "Recipes ₱12,400 · Waste & counts ₱300 · Not stocked ₱1,200". */
export function ingredientDetail(report: ProfitReport): string {
  if (report.ingredientBasis === "purchases") return "Estimate · from what you bought";
  const parts = [`Recipes ${formatMoney(report.recipeCogsCents)}`];
  if (report.lossesCents !== 0) parts.push(`Waste & counts ${formatMoney(report.lossesCents)}`);
  if (report.directIngredientCents !== 0) parts.push(`Not stocked ${formatMoney(report.directIngredientCents)}`);
  return parts.join(" · ");
}

export interface ProfitVerdict {
  isLoss: boolean;
  /** "Lugi (loss) · −₱3,200 · 4% of sales" or "44% of sales". */
  text: string;
  /** For a screen reader: the word, not the colour. */
  spoken: string;
}

/** A loss is red WITH an icon and the word "Lugi"; never colour alone (plan §5.6). */
export function profitVerdict(report: ProfitReport): ProfitVerdict {
  const share = report.ratios.profit === null ? null : formatRatio(Math.abs(report.ratios.profit));
  if (report.profitCents < 0) {
    const text = `Lugi (loss) · ${formatMoney(report.profitCents)}${share ? ` · ${share} of sales` : ""}`;
    return { isLoss: true, text, spoken: `Loss of ${formatMoney(Math.abs(report.profitCents))}` };
  }
  const text = share ? `${share} of sales` : "No sales yet";
  return { isLoss: false, text, spoken: `Profit ${formatMoney(report.profitCents)}, ${text}` };
}

/** "Not in profit: big purchases ₱25,000 · owner took cash … ₱5,000." Null when both are zero. */
export function notInProfitLine(report: ProfitReport): string | null {
  const parts = [
    report.capexCents > 0 ? `big purchases ${formatMoney(report.capexCents)}` : null,
    report.notExpenseCents > 0 ? `owner took cash, deposits & loans ${formatMoney(report.notExpenseCents)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `Not in profit: ${parts.join(" · ")}. See Cash flow.` : null;
}

export interface MoneyBar {
  categoryId: string;
  name: string;
  /** For the category's tile and bar colour (lib/expenses/category-look.ts). */
  group: ExpenseGroup;
  systemKey: string | null;
  cents: number;
  /** 0–1 of the largest bar. */
  share: number;
}

/** "Where the money went": the expense categories, largest first, at most `limit` (rest folded into "Other N"). */
export function moneyBars(report: ProfitReport, limit = 5): { bars: MoneyBar[]; restCents: number; restCount: number } {
  const rows = report.byCategory.filter((row) => row.cents > 0);
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const max = Math.max(1, ...top.map((row) => row.cents), rest.reduce((sum, row) => sum + row.cents, 0));
  return {
    bars: top.map((row) => ({
      categoryId: row.categoryId,
      name: row.name.replace(/\s*\(.*\)\s*$/, ""),
      group: row.group,
      systemKey: row.systemKey,
      cents: row.cents,
      share: row.cents / max,
    })),
    restCents: rest.reduce((sum, row) => sum + row.cents, 0),
    restCount: rest.length,
  };
}
