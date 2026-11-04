/**
 * The "N left" badge on a register tile, and on an option in the picker.
 *
 * Mirrors the storefront stepper's hint (`src/lib/inventory/stepper-cap.ts`,
 * threshold pinned by `pos-stock-hint.test.ts`): quiet above the threshold —
 * "40 left" is noise, and a grid that cries shortage on every dish trains the
 * cashier to ignore it on the one that matters.
 *
 * Unlike the storefront, zero IS shown as a count ("0 left"): the dish is still
 * on sale (auto-86 is off, or the owner chose "Sell anyway"), the estimate may
 * be wrong, and the cashier may sell it after a warning. "Sold out" is the
 * merchant's switch and is drawn by the tile itself, never by this.
 */

import type { StockDemandLine } from "./pos-stock-warning";

/** Mirror of the web's `STOCK_HINT_THRESHOLD`. */
export const STOCK_HINT_THRESHOLD = 10;

export interface StockHint {
  label: string;
  /** The estimate is at zero — draw it as a warning, still tappable. */
  isOut: boolean;
}

/**
 * @param ceiling units producible, or undefined when untracked
 * @param addedInSale units this sale already asks for (edit-aware — see
 *   `saleStockDemand`)
 */
export function describeStockHint(ceiling: number | undefined, addedInSale: number): StockHint | null {
  if (ceiling === undefined) return null;

  const remaining = Math.max(0, ceiling - Math.max(0, addedInSale));
  if (remaining <= 0) return { label: "0 left", isOut: true };
  if (remaining > STOCK_HINT_THRESHOLD) return null;
  return { label: `${remaining} left`, isOut: false };
}

/** Units the sale asks for, per dish. */
export function unitsByDish(demand: readonly StockDemandLine[]): Record<string, number> {
  return demand.reduce<Record<string, number>>(
    (acc, line) => ({ ...acc, [line.menuItemId]: (acc[line.menuItemId] ?? 0) + line.quantity }),
    {},
  );
}
