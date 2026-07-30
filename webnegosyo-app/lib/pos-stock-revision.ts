/**
 * The stock an order edit has to move.
 *
 * Placing the order already spent its ingredients, so an edit moves only the
 * DIFFERENCE. Re-depleting the whole order double-spends it; forgetting a
 * removed item leaves stock permanently short. Both failures are invisible
 * until someone sells something they do not have.
 *
 * Identity is the menu item PLUS its selected options. {@link
 * ./order-stock-delta} groups by menu item alone, which is right for counting
 * units sold and wrong for stock: a Small Latte and a Large Latte are one menu
 * item but different quantities of milk, so swapping one for the other has to
 * move stock rather than net to zero. That module stays for the unit-level view;
 * anything touching the ledger should come through here.
 *
 * Pure and side-effect free.
 */

import type { PosStockItem } from "./pos-stock";

export interface PosStockRevision {
  /** Configurations to spend, because the edit added them. */
  deplete: PosStockItem[];
  /** Configurations to put back, because the edit removed them. */
  restore: PosStockItem[];
  /** False when the edit changed no stock at all — skip the round trip. */
  hasMovement: boolean;
}

/**
 * Stable identity for a configuration.
 *
 * Option ids are sorted because selection order is a UI accident: the same
 * drink configured two ways round must not read as two different things and
 * produce a spurious restore-and-deplete pair. Mirrors `lineKey` in
 * `pos-cart.ts`, minus the kitchen note — a note changes nothing about what is
 * spent.
 */
function configurationKey(item: PosStockItem): string {
  return `${item.menuItemId}|${item.optionIds.slice().sort().join(",")}`;
}

/** Units per configuration, collapsing lines that spend the same ingredients. */
function unitsByConfiguration(
  items: readonly PosStockItem[],
): Map<string, PosStockItem> {
  const totals = new Map<string, PosStockItem>();

  for (const item of items) {
    // A menu item deleted after the sale resolves to no recipe, so there is
    // nothing to move stock against.
    if (!item.menuItemId) continue;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue;

    const key = configurationKey(item);
    const existing = totals.get(key);

    totals.set(
      key,
      existing
        ? { ...existing, quantity: existing.quantity + item.quantity }
        : { ...item, optionIds: [...item.optionIds] },
    );
  }

  return totals;
}

/**
 * What to spend and what to put back when saving an edit.
 *
 * @param before the order's items as they were placed (or last saved)
 * @param after the items the edit is saving
 */
export function posStockRevision(
  before: readonly PosStockItem[],
  after: readonly PosStockItem[],
): PosStockRevision {
  const beforeUnits = unitsByConfiguration(before);
  const afterUnits = unitsByConfiguration(after);

  const deplete: PosStockItem[] = [];
  const restore: PosStockItem[] = [];

  for (const key of new Set([...beforeUnits.keys(), ...afterUnits.keys()])) {
    const was = beforeUnits.get(key);
    const now = afterUnits.get(key);
    const delta = (now?.quantity ?? 0) - (was?.quantity ?? 0);
    if (delta === 0) continue;

    // Either side carries the same menu item and options; whichever exists.
    const shape = now ?? was;
    if (!shape) continue;

    const movement: PosStockItem = {
      menuItemId: shape.menuItemId,
      quantity: Math.abs(delta),
      optionIds: [...shape.optionIds],
    };

    if (delta > 0) deplete.push(movement);
    else restore.push(movement);
  }

  return {
    deplete,
    restore,
    hasMovement: deplete.length > 0 || restore.length > 0,
  };
}
