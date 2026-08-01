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
}

/**
 * Map a register cart to its depletion items, one per line.
 *
 * Lines are never merged: two configurations of the same menu item spend
 * different ingredients, so each must be resolved against its own recipes.
 */
export function buildPosStockItems(cart: readonly PosCartLine[]): PosStockItem[] {
  return cart.map((line) => ({
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    optionIds: line.selections.map((selection) => selection.optionId),
  }));
}
