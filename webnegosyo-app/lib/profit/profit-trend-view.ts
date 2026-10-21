/**
 * The trend card's geometry: profit per bucket on one axis with the bucket's
 * sales drawn faintly behind, losses below the axis, the running bucket marked
 * unfinished. Heights are shares (0–1) of the tallest value. Pure.
 */

import type { ProfitGrain } from "./profit-types";
import type { TrendBar } from "./profit-service";
import { formatMoney } from "./profit-view";

export interface TrendColumn {
  key: string;
  label: string;
  /** |profit| as a share of the axis. */
  profitShare: number;
  /** Sales (never below zero) as a share of the axis; drawn above the axis only. */
  salesShare: number;
  isLoss: boolean;
  isIncomplete: boolean;
  spoken: string;
}

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

export function trendColumns(bars: readonly TrendBar[]): { columns: TrendColumn[]; hasLoss: boolean } {
  const scale = Math.max(1, ...bars.map((bar) => Math.max(Math.abs(finite(bar.profitCents)), finite(bar.netSalesCents))));
  const columns = bars.map((bar) => {
    const profit = finite(bar.profitCents);
    const sales = Math.max(0, finite(bar.netSalesCents));
    const isLoss = profit < 0;
    return {
      key: bar.key,
      label: bar.label,
      profitShare: Math.abs(profit) / scale,
      salesShare: sales / scale,
      isLoss,
      isIncomplete: bar.isIncomplete,
      spoken: `${bar.label}: ${isLoss ? "lost" : "kept"} ${formatMoney(Math.abs(profit))} on ${formatMoney(sales)} in sales${bar.isIncomplete ? ", still running" : ""}`,
    };
  });
  return { columns, hasLoss: columns.some((column) => column.isLoss) };
}

const TITLES: Readonly<Record<ProfitGrain, string>> = { day: "Day by day", week: "Week by week", month: "Month by month" };

export function trendTitle(grain: ProfitGrain): string {
  return TITLES[grain];
}
