/**
 * Translates a finished register sale into the platform's stock-depletion
 * payload.
 *
 * Deliberately separate from {@link buildPosOrder}: the order itself goes to
 * the tenant's Convex backend, whose `orders` schema has no place for option
 * ids and is already deployed per tenant. Carrying ids through Convex would
 * mean a schema bump and a redeploy for every tenant, so depletion talks to the
 * platform directly instead — stock lives in the platform Supabase for every
 * tenant regardless of where their orders live.
 *
 * Pure and side-effect free. See lib/pos-stock-notify.ts for the network call.
 */

import type { PosCartLine } from "./pos-cart";

/** One configured line's contribution to stock, as the platform expects it. */
export interface PosStockItem {
  menuItemId: string;
  quantity: number;
  /**
   * Ids of every selected modifier option. The platform feeds the same id set
   * to both its variation-option and modifier-option recipe buckets — ids are
   * unique per option, so whichever recipe exists matches.
   */
  optionIds: string[];
  /**
   * The same id set again, for the platform's ADDON recipe bucket. The
   * register's unified selection model cannot tell an add-on-group option from
   * a variation option, but the mirrored legacy `addons` share the option's
   * own id — so a recipe attached to an addon matches here and every other id
   * finds nothing, by the same uniqueness reasoning as `optionIds` above.
   * Optional so items built before this field existed keep resolving.
   */
  addonIds?: string[];
  /**
   * Portions per unit for add-ons picked more than once (`{ [id]: n }`), only
   * for n ≠ 1 and only for ids in `addonIds`. The platform multiplies that
   * option's recipe by n — the same field web checkout sends.
   */
  addonQuantities?: Record<string, number>;
}

/** The platform accepts 1..99 portions of one add-on. */
export const MAX_ADDON_PORTIONS = 99;

function portionsOf(portions: number | undefined): number {
  if (portions === undefined || !Number.isFinite(portions)) return 1;
  return Math.min(MAX_ADDON_PORTIONS, Math.max(1, Math.round(portions)));
}

/** `{ id: n }` for every selection carrying more than one portion, else null. */
function addonQuantitiesOf(selections: PosCartLine["selections"]): Record<string, number> | null {
  const entries = selections
    .map((selection) => [selection.optionId, portionsOf(selection.portions)] as const)
    .filter(([, portions]) => portions !== 1);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * Map a register cart to its depletion items, one per line.
 *
 * Lines are never merged: two configurations of the same menu item spend
 * different ingredients, so each must be resolved against its own recipes.
 */
export function buildPosStockItems(cart: readonly PosCartLine[]): PosStockItem[] {
  return cart.map((line) => {
    const addonQuantities = addonQuantitiesOf(line.selections);
    return {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      optionIds: line.selections.map((selection) => selection.optionId),
      addonIds: line.selections.map((selection) => selection.optionId),
      ...(addonQuantities ? { addonQuantities } : {}),
    };
  });
}
