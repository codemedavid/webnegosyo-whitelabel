/**
 * The findings as action rows (design §5): an icon, a short title, one line
 * of why, and — when there is something to do — one button. Built on
 * `findingRow` (the web's words, pinned by profit.test.ts) so the keys, tones
 * and actions stay the same; only the layout's title and detail are new. Pure.
 */

import type { IconName } from "../../components/Icon";
import type { ProfitFinding } from "./profit-model";
import { findingRow, formatMoney, formatRatio, type FindingAction } from "./profit-view";

export interface FindingCard {
  key: string;
  tone: "warning" | "info";
  icon: IconName;
  title: string;
  detail: string;
  action: FindingAction | null;
}

const ICONS: Readonly<Record<ProfitFinding["kind"], IconName>> = {
  missing_recurring: "receipt",
  no_expenses: "receipt",
  uncosted_dishes: "utensils",
  unsorted_payouts: "drawer",
  ingredient_estimate: "basket",
  uncosted_movements: "stock",
  dish_costs_hidden: "lock",
  store_wide_excluded: "info",
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function words(finding: ProfitFinding, periodPhrase: string, fallback: string): { title: string; detail: string } {
  switch (finding.kind) {
    case "missing_recurring":
      return {
        title: `No ${finding.categoryName} recorded ${periodPhrase}`,
        detail: `You paid ${formatMoney(finding.previousCents)} last time. Until it’s in, profit looks higher than it is.`,
      };
    case "no_expenses":
      return {
        title: `No expenses recorded ${periodPhrase}`,
        detail: "Empty can mean missing, so profit looks too high until they’re in.",
      };
    case "uncosted_dishes":
      return {
        title: "Some dishes have no recipe",
        detail: `${plural(finding.uncostedDishes, "dish", "dishes")} (${formatRatio(finding.uncostedShare)} of what sold) ${finding.uncostedDishes === 1 ? "has" : "have"} no cost, so ingredients are estimated.`,
      };
    case "unsorted_payouts":
      return {
        title: "Give these a category",
        detail: `${plural(finding.count, "drawer pay-out", "drawer pay-outs")} (${formatMoney(finding.cents)}) ${finding.count === 1 ? "isn’t" : "aren’t"} in Expenses yet.`,
      };
    case "ingredient_estimate":
      return { title: "Ingredients are an estimate", detail: "Based on what you bought, not what you used." };
    case "uncosted_movements":
      return { title: "Some stock moves have no cost", detail: fallback };
    case "dish_costs_hidden":
      return { title: "Your branch’s stock use only", detail: fallback };
    case "store_wide_excluded":
      return { title: "Store-wide costs left out", detail: fallback };
  }
}

/** A button reads as a verb the owner can act on; "Sort" became "Open" (the title says what). */
function relabel(action: FindingAction | null): FindingAction | null {
  if (action?.kind === "sort") return { ...action, label: "Open" };
  return action;
}

export function findingCard(finding: ProfitFinding, periodPhrase: string): FindingCard {
  const row = findingRow(finding, periodPhrase);
  return {
    key: row.key,
    tone: row.tone,
    icon: ICONS[finding.kind],
    ...words(finding, periodPhrase, row.text),
    action: relabel(row.action),
  };
}

/**
 * The cards under the answer. On a store's first run the welcome card already
 * says "Add your first expense" with its own button, so the "No expenses
 * recorded" card would only repeat it (two Add buttons).
 */
export function findingCards(findings: readonly ProfitFinding[], periodPhrase: string, isFirstRun = false): FindingCard[] {
  return findings
    .filter((finding) => !(isFirstRun && finding.kind === "no_expenses"))
    .map((finding) => findingCard(finding, periodPhrase));
}
