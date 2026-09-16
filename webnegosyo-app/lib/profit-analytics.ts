// Pure profit / fast-mover / revenue-concentration math for the Products screen.
// Consumes the same rows as productAnalytics:getAll (revenue, units, margin, and
// — when a cost has been entered — totalCost/totalProfit). No React, no Convex,
// so every branch stays unit-testable. Mirrors lib/growth-metrics.ts.

export interface ProductRow {
  menuItemId: string;
  menuItemName?: string;
  totalUnitsSold: number;
  totalRevenue: number;
  /** Present only once a cost price is entered for the item. */
  totalCost?: number;
  totalProfit?: number;
  marginPercent?: number;
  avgDailyUnits: number;
}

export interface ProfitSummary {
  /** Revenue across every row, costed or not. */
  totalRevenue: number;
  /** Revenue of the rows that have a known cost — the profit denominator. */
  costedRevenue: number;
  totalCost: number;
  totalProfit: number;
  /** Revenue-weighted margin over costed rows; undefined when none are costed. */
  weightedMarginPercent?: number;
  itemsWithCost: number;
  /** Rows that sold but have no cost entered — the "add cost to unlock profit" nag. */
  itemsMissingCost: number;
}

export interface ConcentrationItem {
  menuItemId: string;
  menuItemName?: string;
  totalRevenue: number;
  /** This item's share of total revenue, to one decimal. */
  revenueShare: number;
  /** Running cumulative share through this item, to one decimal. */
  cumulativeShare: number;
}

export interface RevenueConcentration {
  items: ConcentrationItem[];
  totalRevenue: number;
  /** How many top items the headline summarizes (capped at items available). */
  topN: number;
  topNShare: number;
  paretoThreshold: number;
  /** Fewest items whose cumulative revenue reaches the threshold. */
  itemsForThreshold: number;
  headline: string;
}

export interface ConcentrationOptions {
  topN?: number;
  paretoThreshold?: number;
}

const DEFAULT_TOP_N = 5;
const DEFAULT_PARETO_THRESHOLD = 80;
const NO_DATA_HEADLINE = "Not enough sales data yet";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A row has usable cost data once a cost or margin has been entered. */
function hasCost(row: ProductRow): boolean {
  return row.totalCost !== undefined || row.marginPercent !== undefined;
}

/** Cost for a costed row: prefer the stored cost, else derive from margin. */
function costOf(row: ProductRow): number {
  if (row.totalCost !== undefined) return row.totalCost;
  const margin = row.marginPercent ?? 0;
  return row.totalRevenue * (1 - margin / 100);
}

/** Profit for a costed row: prefer the stored profit, else revenue − cost. */
function profitOf(row: ProductRow): number {
  if (row.totalProfit !== undefined) return row.totalProfit;
  return row.totalRevenue - costOf(row);
}

/** Store-level profit rollup: totals, weighted margin, and cost coverage. */
export function computeProfitSummary(rows: readonly ProductRow[]): ProfitSummary {
  let totalRevenue = 0;
  let costedRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let itemsWithCost = 0;
  let itemsMissingCost = 0;

  for (const row of rows) {
    totalRevenue += row.totalRevenue;

    if (hasCost(row)) {
      itemsWithCost += 1;
      costedRevenue += row.totalRevenue;
      totalCost += costOf(row);
      totalProfit += profitOf(row);
    } else if (row.totalUnitsSold > 0) {
      // Only items that actually sold are worth nagging about.
      itemsMissingCost += 1;
    }
  }

  return {
    totalRevenue,
    costedRevenue,
    totalCost,
    totalProfit,
    weightedMarginPercent:
      costedRevenue > 0 ? round1((totalProfit / costedRevenue) * 100) : undefined,
    itemsWithCost,
    itemsMissingCost,
  };
}

/** Fast movers: items that sold, ranked by daily velocity (units as tiebreak). */
export function rankByVelocity(
  rows: readonly ProductRow[],
  limit?: number,
): ProductRow[] {
  const ranked = rows
    .filter((row) => row.totalUnitsSold > 0)
    .sort((a, b) => b.avgDailyUnits - a.avgDailyUnits || b.totalUnitsSold - a.totalUnitsSold);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/** Highest-margin items: costed rows ranked by margin (profit as tiebreak). */
export function rankByMargin(
  rows: readonly ProductRow[],
  limit?: number,
): ProductRow[] {
  const ranked = rows
    .filter((row) => row.marginPercent !== undefined && row.totalRevenue > 0)
    .sort(
      (a, b) =>
        (b.marginPercent ?? 0) - (a.marginPercent ?? 0) || profitOf(b) - profitOf(a),
    );
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/**
 * Pareto analysis: which few items drive most revenue. Items sorted by revenue
 * with per-item and cumulative shares, plus a "top N drive X%" headline and the
 * fewest items needed to reach the Pareto threshold.
 */
export function computeRevenueConcentration(
  rows: readonly ProductRow[],
  options: ConcentrationOptions = {},
): RevenueConcentration {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const paretoThreshold = options.paretoThreshold ?? DEFAULT_PARETO_THRESHOLD;

  const sorted = rows
    .filter((row) => row.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = sorted.reduce((sum, row) => sum + row.totalRevenue, 0);

  if (totalRevenue <= 0) {
    return {
      items: [],
      totalRevenue: 0,
      topN,
      topNShare: 0,
      paretoThreshold,
      itemsForThreshold: 0,
      headline: NO_DATA_HEADLINE,
    };
  }

  // Track cumulative on the raw fraction to avoid per-item rounding drift.
  let cumulativeRevenue = 0;
  let itemsForThreshold = 0;
  const items: ConcentrationItem[] = sorted.map((row, index) => {
    cumulativeRevenue += row.totalRevenue;
    const cumulativeFraction = (cumulativeRevenue / totalRevenue) * 100;
    if (itemsForThreshold === 0 && cumulativeFraction >= paretoThreshold) {
      itemsForThreshold = index + 1;
    }
    return {
      menuItemId: row.menuItemId,
      menuItemName: row.menuItemName,
      totalRevenue: row.totalRevenue,
      revenueShare: round1((row.totalRevenue / totalRevenue) * 100),
      cumulativeShare: round1(cumulativeFraction),
    };
  });

  const effectiveN = Math.min(topN, items.length);
  const topNRevenue = sorted
    .slice(0, effectiveN)
    .reduce((sum, row) => sum + row.totalRevenue, 0);
  const topNShare = round1((topNRevenue / totalRevenue) * 100);

  return {
    items,
    totalRevenue,
    topN,
    topNShare,
    paretoThreshold,
    itemsForThreshold,
    headline: `Top ${effectiveN} items drive ${topNShare}% of revenue`,
  };
}
