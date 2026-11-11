/**
 * The Profit hero's words and its falling bar (design §5): the answer first,
 * as a sentence, then one bar that falls from sales through ingredients and
 * expenses to what was kept. Pure; money is integer centavos.
 */

import { formatPesoShort } from "../expenses/money-text";
import type { ProfitReport } from "./profit-model";
import type { ProfitWindow } from "./profit-period";
import { formatMoney, formatRatio } from "./profit-view";

export type FallTone = "sales" | "ingredients" | "expenses" | "kept" | "loss";

export interface FallRow {
  key: "sales" | "ingredients" | "expenses" | "kept";
  label: string;
  /** `formatPesoShort`: "₱124.6k", "−₱40.6k". */
  valueText: string;
  /** Where the segment starts, 0–1 of the track. */
  offset: number;
  /** How long it is, 0–1 of the track; offset + width ≤ 1. */
  width: number;
  tone: FallTone;
  spoken: string;
}

const atLeastZero = (cents: number): number => (Number.isFinite(cents) && cents > 0 ? cents : 0);
const clampShare = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The track is the larger of sales and costs, so a loss (costs past sales)
 * still fits: "Lost" starts where sales end. Negative costs (a count that found
 * more stock than expected) draw as nothing; the figures stay true.
 */
export function fallingBars(report: ProfitReport): FallRow[] {
  const sales = atLeastZero(report.netSalesCents);
  const ingredients = atLeastZero(report.ingredientCostCents);
  const expenses = atLeastZero(report.expensesCents);
  const costs = ingredients + expenses;
  const scale = Math.max(sales, costs, 1);
  const share = (cents: number) => clampShare(cents / scale);
  const isLoss = report.profitCents < 0;
  const kept = isLoss
    ? { offset: share(sales), width: share(costs - sales), tone: "loss" as const, label: "Lost" }
    : { offset: share(costs), width: share(Math.max(0, sales - costs)), tone: "kept" as const, label: "Kept" };
  return [
    { key: "sales", label: "Sales", valueText: formatPesoShort(report.netSalesCents), offset: 0, width: share(sales), tone: "sales", spoken: `Sales ${formatMoney(report.netSalesCents)}` },
    {
      key: "ingredients",
      label: "Ingredients",
      valueText: formatPesoShort(-report.ingredientCostCents),
      offset: 0,
      width: share(ingredients),
      tone: "ingredients",
      spoken: `Minus ingredients ${formatMoney(report.ingredientCostCents)}`,
    },
    {
      key: "expenses",
      label: "Expenses",
      valueText: formatPesoShort(-report.expensesCents),
      offset: share(ingredients),
      width: share(expenses),
      tone: "expenses",
      spoken: `Minus expenses ${formatMoney(report.expensesCents)}`,
    },
    {
      key: "kept",
      label: kept.label,
      valueText: formatPesoShort(report.profitCents),
      offset: kept.offset,
      width: Math.min(kept.width, 1 - kept.offset),
      tone: kept.tone,
      spoken: `${kept.label} ${formatMoney(Math.abs(report.profitCents))}`,
    },
  ];
}

type EyebrowWindow = Pick<ProfitWindow, "preset" | "label" | "isPartial" | "fromKey" | "toKey">;

/** "Kept in October so far", "Kept this week so far", "Lost on Oct 3". */
export function heroEyebrow(w: EyebrowWindow, isLoss: boolean): string {
  const verb = isLoss ? "Lost" : "Kept";
  const when =
    w.preset === "this_month" || w.preset === "last_month"
      ? `in ${w.label}`
      : w.preset === "this_week"
        ? "this week"
        : w.fromKey === w.toKey
          ? `on ${w.label}`
          : w.label;
  return `${verb} ${when}${w.isPartial ? " so far" : ""}`;
}

/** One plain sentence under the figure; a loss is said in words, not only in red. */
export function heroSentence(report: ProfitReport, w: Pick<ProfitWindow, "phrase" | "isPartial">): string {
  const sales = report.netSalesCents;
  if (sales <= 0) {
    const out = atLeastZero(report.ingredientCostCents) + atLeastZero(report.expensesCents);
    if (out === 0) return `No sales or costs ${w.isPartial ? "yet " : ""}${w.phrase}.`;
    return `No sales ${w.isPartial ? "yet " : ""}${w.phrase}. ${formatMoney(out)} went out.`;
  }
  if (report.profitCents < 0) {
    return `You spent ${formatMoney(-report.profitCents)} more than the ${formatMoney(sales)} you made in sales.`;
  }
  return `From ${formatMoney(sales)} in sales you kept ${formatRatio(report.ratios.profit)}.`;
}
