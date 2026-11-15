/**
 * Add-on amounts at the register: "Fried Rice ×2" on one dish.
 *
 * Mirrors web checkout's quantity groups (`src/lib/modifier-groups-cart.ts`
 * `setOptionQuantity`): a group whose `selection_mode` is `quantity` lets each
 * add-on be picked 0..99 times per dish, and the group's min/max count
 * PORTIONS across all its add-ons, not distinct picks.
 *
 * One cart selection per add-on carries the whole amount: `portions` is the
 * count (absent = one, so a single portion keeps the historical line key and
 * order shape) and `priceModifier` already covers every portion — the contract
 * `PosCartSelection` documents and the edit/stock code already relies on.
 *
 * Pure: every function returns new arrays and never mutates its input.
 */

import {
  isOptionAvailable,
  isQuantityGroup,
  type ModifierGroup,
  type ModifierOption,
} from "./modifier-groups";
import { resolveModifierPrice, type OrderTypePricing } from "./order-type-pricing";
import { round2, type PosCartSelection } from "./pos-cart";
import { MAX_ADDON_PORTIONS } from "./pos-stock";

function portionsOf(selection: Pick<PosCartSelection, "portions">): number {
  return selection.portions ?? 1;
}

/**
 * A cart selection for `portions` of one option, priced for the channel.
 * Each portion is marked up on its own, so ×2 costs exactly twice ×1.
 */
export function selectionFor(
  group: ModifierGroup,
  option: ModifierOption,
  pricing: OrderTypePricing | null,
  portions = 1,
): PosCartSelection {
  return {
    groupId: group.id,
    groupName: group.name,
    optionId: option.id,
    optionName: option.name,
    priceModifier: round2(resolveModifierPrice(option.price_modifier, pricing) * portions),
    listPriceModifier: round2(option.price_modifier * portions),
    ...(portions > 1 ? { portions } : {}),
  };
}

/** Portions of every add-on chosen in one group. */
export function groupPortions(selections: readonly PosCartSelection[], groupId: string): number {
  return selections
    .filter((selection) => selection.groupId === groupId)
    .reduce((sum, selection) => sum + portionsOf(selection), 0);
}

/** Portions of one add-on; 0 when it is not chosen. */
export function optionPortions(selections: readonly PosCartSelection[], optionId: string): number {
  const selection = selections.find((candidate) => candidate.optionId === optionId);
  return selection ? portionsOf(selection) : 0;
}

function isPortionCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_ADDON_PORTIONS;
}

/**
 * The most portions of one add-on a single dish may carry: 99, the add-on's
 * own simple stock count when it keeps one (web `setOptionPortions` refuses
 * more than `stock_qty` the same way), 0 when it is sold out.
 */
export function maxOptionPortions(option: ModifierOption): number {
  if (!isOptionAvailable(option)) return 0;
  if (option.stock_mode === "simple") return Math.min(MAX_ADDON_PORTIONS, Math.max(0, Math.floor(option.stock_qty ?? 0)));
  return MAX_ADDON_PORTIONS;
}

/**
 * Set one add-on to `portions` (0 removes it).
 *
 * An increase that would take the group past `max_select`, or the add-on past
 * what it has left (`maxOptionPortions`), is refused and the SAME array comes
 * back, so the sheet can tell nothing happened. A decrease is always
 * honoured. Non-quantity groups and bad counts are ignored.
 */
export function setOptionPortions(
  selections: readonly PosCartSelection[],
  group: ModifierGroup,
  option: ModifierOption,
  portions: number,
  pricing: OrderTypePricing | null,
): PosCartSelection[] {
  if (!isQuantityGroup(group) || !isPortionCount(portions)) return selections as PosCartSelection[];

  const current = optionPortions(selections, option.id);
  const others = groupPortions(selections, group.id) - current;
  if (
    portions > current &&
    ((group.max_select !== null && others + portions > group.max_select) ||
      portions > maxOptionPortions(option))
  ) {
    return selections as PosCartSelection[];
  }

  if (portions === 0) return selections.filter((selection) => selection.optionId !== option.id);

  const next = selectionFor(group, option, pricing, portions);
  return current > 0
    ? selections.map((selection) => (selection.optionId === option.id ? next : selection))
    : [...selections, next];
}

/** Whether one more portion of anything fits in the group. */
export function canAddPortion(selections: readonly PosCartSelection[], group: ModifierGroup): boolean {
  return group.max_select === null || groupPortions(selections, group.id) < group.max_select;
}
