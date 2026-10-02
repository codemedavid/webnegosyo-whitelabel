/**
 * The numbers above the shelf: what the stock is worth, how healthy it is, and
 * how it splits into the merchant's own categories.
 *
 * Pure — no React, no Supabase, no colours. Levels themselves come from
 * inventory-stock.ts; this only aggregates them.
 */

import type { StockItemView, StockLevel, StockSummary } from "./inventory-stock";

/** The chip key for ingredients with no category. Not a valid category name. */
export const UNCATEGORIZED = "__uncategorized__";

export interface StockValue {
  /** Pesos on hand at moving-average cost. */
  total: number;
  /** Ingredients holding stock with no cost — the total under-reports by these. */
  uncostedCount: number;
}

export interface HealthSegment {
  level: StockLevel;
  fraction: number;
}

export interface CategoryChip {
  key: string;
  label: string;
  count: number;
}

/**
 * What one ingredient on the shelf is worth. Negative stock counts as zero: it
 * is a sale recorded before its delivery — a gap in the paperwork, not a debt.
 */
export function valueOf(view: StockItemView): number {
  const cost = view.unitCost ?? 0;
  if (cost <= 0 || view.quantity <= 0) return 0;
  return view.quantity * cost;
}

export function stockValue(views: readonly StockItemView[]): StockValue {
  let total = 0;
  let uncostedCount = 0;
  for (const view of views) {
    total += valueOf(view);
    if (view.quantity > 0 && !((view.unitCost ?? 0) > 0)) uncostedCount += 1;
  }
  return { total, uncostedCount };
}

/** Worst first, so the ring starts with the trouble. Empty segments dropped. */
export function healthSegments(
  summary: Pick<StockSummary, "outCount" | "lowCount" | "okCount" | "total">,
): HealthSegment[] {
  if (summary.total <= 0) return [];
  const parts: [StockLevel, number][] = [
    ["out", summary.outCount],
    ["low", summary.lowCount],
    ["ok", summary.okCount],
  ];
  return parts
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ level, fraction: count / summary.total }));
}

function categoryKey(view: StockItemView): string {
  const trimmed = view.category?.trim();
  return trimmed ? trimmed : UNCATEGORIZED;
}

/**
 * One chip per category, alphabetical, uncategorised last. Nothing at all when
 * there is only one group — a chip that filters nothing is noise.
 */
export function categoryChips(views: readonly StockItemView[]): CategoryChip[] {
  const counts = new Map<string, number>();
  for (const view of views) {
    const key = categoryKey(view);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size < 2) return [];

  return [...counts.entries()]
    .sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    })
    .map(([key, count]) => ({ key, label: key === UNCATEGORIZED ? "Other" : key, count }));
}

/** Null = every category. */
export function filterByCategory(
  views: readonly StockItemView[],
  category: string | null,
): StockItemView[] {
  if (category === null) return [...views];
  return views.filter((view) => categoryKey(view) === category);
}
