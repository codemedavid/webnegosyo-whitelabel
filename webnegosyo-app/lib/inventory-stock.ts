/**
 * The merchant app's view model for the ingredient shelf.
 *
 * The web admin surfaces stock as *alerts* — rows written when an ingredient
 * crosses its reorder level (`src/lib/inventory/stock-alerts-view.ts`). On the
 * phone the merchant is standing in front of the shelf, so this surface shows
 * the whole thing and sorts the trouble to the top. Two consequences worth
 * stating: the screen is useful to a tenant who never switched alerts on, and
 * it needs no `stock_alerts` read at all — the level is derived from the same
 * two numbers the web core derives it from.
 *
 * Pure by design: no React, no Supabase, no colours. `evaluateStockLevel`
 * mirrors `src/lib/inventory/low-stock.ts` exactly; a badge and an alert
 * disagreeing about whether an ingredient is low would be worse than either
 * being slightly wrong.
 */

/**
 * Quantities are NUMERIC(16,4), so anything smaller than a ten-thousandth is
 * round-trip dust rather than stock. Reading that dust as remaining stock would
 * keep an exhausted ingredient out of the `out` bucket.
 */
const QUANTITY_EPSILON = 1e-4;

/**
 * A bar is exactly half full at the reorder line, so "below halfway" reads as
 * trouble without the merchant having to compare two numbers.
 */
const FULL_BAR_MULTIPLE = 2;

export type StockLevel = "ok" | "low" | "out";

/** The columns of `inventory_items` this surface depends on. */
export interface InventoryItemRow {
  id: string;
  name: string;
  current_qty: number;
  reorder_level: number;
  is_active: boolean;
  stock_unit_id: string | null;
}

export interface InventoryUnitRow {
  id: string;
  abbreviation: string;
}

export interface StockItemView {
  id: string;
  name: string;
  /** On-hand quantity in the ingredient's stock unit. */
  quantity: number;
  reorderLevel: number;
  /**
   * The unit this ingredient is stocked in. Null when it has none, which is the
   * one case a movement cannot be recorded for — the server would have no unit
   * to resolve the quantity against.
   */
  stockUnitId: string | null;
  /** Empty for an ingredient with no meaningful unit to show. */
  unitAbbreviation: string;
  level: StockLevel;
}

export interface StockSummary {
  outCount: number;
  lowCount: number;
  okCount: number;
  total: number;
  /** Out + low: the count the header badge and the filter chip both want. */
  needsAttention: number;
  headline: string;
}

export interface StockFilter {
  level: StockLevel | "all";
  query: string;
}

/** Worst first. */
const LEVEL_RANK: Record<StockLevel, number> = { out: 0, low: 1, ok: 2 };

function pluralise(count: number): string {
  return count === 1 ? "ingredient" : "ingredients";
}

/**
 * Where an ingredient sits relative to its reorder level.
 *
 * A zero reorder level means the merchant never chose a threshold, so they have
 * not asked to be warned — only actual exhaustion counts.
 */
export function evaluateStockLevel(item: {
  current_qty: number;
  reorder_level: number;
}): StockLevel {
  if (item.current_qty <= QUANTITY_EPSILON) return "out";
  if (item.reorder_level > 0 && item.current_qty <= item.reorder_level) return "low";
  return "ok";
}

/**
 * Join ingredient rows to their units and stamp each with its level.
 *
 * Archived ingredients are dropped: one the merchant retired is not something
 * to reorder. An unresolvable unit costs the suffix, not the row.
 */
export function buildStockViews(
  items: readonly InventoryItemRow[],
  units: readonly InventoryUnitRow[],
): StockItemView[] {
  const abbreviationById = new Map(units.map((unit) => [unit.id, unit.abbreviation]));

  return items
    .filter((item) => item.is_active)
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.current_qty,
      reorderLevel: item.reorder_level,
      stockUnitId: item.stock_unit_id,
      unitAbbreviation:
        (item.stock_unit_id ? abbreviationById.get(item.stock_unit_id) : undefined) ?? "",
      level: evaluateStockLevel(item),
    }));
}

/**
 * Ordered by what stops service first, then alphabetically so a merchant can
 * find a known ingredient by scanning rather than by reading every row.
 *
 * Returns a new array — the caller holds this in React state.
 */
export function sortStockViews(views: readonly StockItemView[]): StockItemView[] {
  return [...views].sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (byLevel !== 0) return byLevel;
    return a.name.localeCompare(b.name);
  });
}

/** One line for the top of the screen. Leads with what cannot be served. */
export function summarizeStock(views: readonly StockItemView[]): StockSummary {
  const outCount = views.filter((v) => v.level === "out").length;
  const lowCount = views.filter((v) => v.level === "low").length;
  const okCount = views.filter((v) => v.level === "ok").length;
  const total = views.length;
  const needsAttention = outCount + lowCount;

  const base = { outCount, lowCount, okCount, total, needsAttention };

  // An empty shelf is an unconfigured feature, not a well-stocked kitchen.
  if (total === 0) return { ...base, headline: "No ingredients tracked yet" };
  if (needsAttention === 0) return { ...base, headline: "Everything is in stock" };

  const parts: string[] = [];
  if (outCount > 0) parts.push(`${outCount} ${pluralise(outCount)} out of stock`);
  if (lowCount > 0) {
    // The noun is already established by the outage clause when both are shown.
    parts.push(
      outCount > 0 ? `${lowCount} running low` : `${lowCount} ${pluralise(lowCount)} running low`,
    );
  }

  return { ...base, headline: parts.join(", ") };
}

/** The level chip and the search box narrow together, not instead of each other. */
export function filterStockViews(
  views: readonly StockItemView[],
  filter: StockFilter,
): StockItemView[] {
  const needle = filter.query.trim().toLowerCase();

  return views.filter((view) => {
    if (filter.level !== "all" && view.level !== filter.level) return false;
    if (needle && !view.name.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
export function formatStockQuantity(quantity: number, unitAbbreviation: string): string {
  const amount = Number(quantity.toFixed(4)).toString();
  return unitAbbreviation ? `${amount} ${unitAbbreviation}` : amount;
}

/**
 * How full to draw the bar, 0..1.
 *
 * Anchored so the reorder level lands at the midpoint: the merchant reads the
 * bar, not the arithmetic. With no threshold set there is nothing to measure
 * against, so the bar is simply full or empty.
 */
export function stockFillRatio(view: StockItemView): number {
  if (view.quantity <= QUANTITY_EPSILON) return 0;
  if (view.reorderLevel <= 0) return 1;
  return Math.min(1, view.quantity / (view.reorderLevel * FULL_BAR_MULTIPLE));
}

/**
 * One ingredient as a sentence — the accessibility label for its row.
 *
 * An exhausted ingredient deliberately shows no quantity: "0 kg left" reads as
 * a measurement, "out of stock" reads as a problem. It also avoids showing a
 * negative, which happens when a sale lands before its delivery is recorded.
 */
export function describeStockView(view: StockItemView): string {
  const quantity = formatStockQuantity(view.quantity, view.unitAbbreviation);

  if (view.level === "out") return `${view.name} is out of stock`;
  if (view.level === "low") {
    const threshold = formatStockQuantity(view.reorderLevel, view.unitAbbreviation);
    return `${view.name} is down to ${quantity} (reorder at ${threshold})`;
  }
  return `${view.name} has ${quantity} on hand`;
}
