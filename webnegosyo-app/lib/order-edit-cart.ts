/**
 * Loading a placed order back into the register cart, and writing it out again.
 *
 * Editing an order turns the order detail screen into the POS register, so a
 * persisted order has to become a `PosCartLine[]` and then become order items
 * again. Two details make that harder than it looks:
 *
 * 1. `order_items.price` means different things depending on who wrote the row.
 *    The register (`pos-order.ts:toOrderItem`) writes the item's BASE price and
 *    folds modifiers into `subtotal`; web checkout
 *    (`src/lib/cart-utils.ts:calculateCartItemUnitPrice`) writes the fully
 *    loaded UNIT price. The one identity both honour is
 *    `subtotal === unitPrice x quantity`, so unit price is ALWAYS derived from
 *    the subtotal and `price` is never trusted.
 *
 * 2. Order items name their modifiers (`typeName`/`optionName`) but do not
 *    carry option ids, while the register keys lines and drives ModifierSheet
 *    by id. Ids are recovered by matching names against the live menu, and
 *    anything that no longer matches is REPORTED rather than dropped — silently
 *    losing a modifier would reprice a real customer's order.
 *
 * Pure and side-effect free: no network, no clock, no id generation.
 */

import type { ModifierGroup } from "./modifier-groups";
import type { OrderAddon, OrderItemDto, OrderVariationSelection } from "./backends/supabase-orders";
import { addLine, type PosCartLine, type PosCartSelection } from "./pos-cart";

/** Live modifier groups per menu item, as the register already loads them. */
export type ModifierCatalog = Record<string, ModifierGroup[]>;

/** A modifier (or whole item) on the order that no longer exists on the menu. */
export interface UnresolvedModifier {
  menuItemName: string;
  /** Absent when the menu item itself is gone. */
  groupName?: string;
  optionName?: string;
}

export interface HydrationResult {
  lines: PosCartLine[];
  /**
   * Everything that could not be matched to the live menu. The edit screen
   * warns on these; the lines are still priced from the order, so the money
   * stays correct even when the catalog has moved on.
   */
  unresolved: UnresolvedModifier[];
}

/** An order item as the revise mutation expects it. */
export interface RevisedOrderItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  /** The LOADED unit price, so `subtotal === price x quantity` always holds. */
  price: number;
  subtotal: number;
  specialInstructions?: string;
  variationSelections?: OrderVariationSelection[];
  addons?: OrderAddon[];
}

/**
 * Group name a resolved add-on falls back to when it matched no live group.
 * Kept distinct from a real group name so it is obvious in the cart.
 */
const ORPHAN_GROUP = "Add-ons";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Case- and whitespace-insensitive, because menu names get retyped. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Find the live group/option a named modifier refers to.
 *
 * `groupName` is optional because add-ons are stored with only their own name;
 * without it, every group is searched for a matching option.
 */
function findOption(
  groups: ModifierGroup[],
  optionName: string,
  groupName?: string,
): { group: ModifierGroup; optionId: string } | null {
  for (const group of groups) {
    if (groupName && !sameName(group.name, groupName)) continue;

    const option = group.options.find((candidate) => sameName(candidate.name, optionName));
    if (option) return { group, optionId: option.id };
  }
  return null;
}

/**
 * Turn one persisted modifier into a cart selection.
 *
 * The price modifier comes from the ORDER, never from the live menu — the
 * customer was charged the historic price and an edit must not silently
 * reprice the modifiers they already agreed to.
 */
function toSelection(
  groups: ModifierGroup[],
  optionName: string,
  priceModifier: number,
  groupName: string | undefined,
  onUnresolved: (groupName: string | undefined, optionName: string) => void,
): PosCartSelection {
  const match = findOption(groups, optionName, groupName);

  if (!match) {
    onUnresolved(groupName, optionName);
    // A synthetic id keeps line identity stable and distinct without pretending
    // the option still exists.
    return {
      groupId: `orphan:${groupName ?? ORPHAN_GROUP}`,
      groupName: groupName ?? ORPHAN_GROUP,
      optionId: `orphan:${optionName}`,
      optionName,
      priceModifier,
    };
  }

  return {
    groupId: match.group.id,
    groupName: match.group.name,
    optionId: match.optionId,
    optionName,
    priceModifier,
  };
}

function selectionsFor(
  item: OrderItemDto,
  groups: ModifierGroup[],
  onUnresolved: (groupName: string | undefined, optionName: string) => void,
): PosCartSelection[] {
  const variations = (item.variationSelections ?? []).map((selection) =>
    toSelection(
      groups,
      selection.optionName,
      selection.priceAdjustment,
      selection.typeName,
      onUnresolved,
    ),
  );

  const addons = (item.addons ?? []).map((addon) =>
    toSelection(groups, addon.name, addon.price, undefined, onUnresolved),
  );

  return [...variations, ...addons];
}

/**
 * Load a placed order's items into a register cart.
 *
 * Identically-configured items stack, exactly as they would if rung up at the
 * counter. Zero-quantity rows are dropped rather than dividing by zero.
 */
export function hydratePosCart(
  items: readonly OrderItemDto[],
  catalog: ModifierCatalog,
): HydrationResult {
  const unresolved: UnresolvedModifier[] = [];

  const lines = items.reduce<PosCartLine[]>((cart, item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return cart;

    const groups = (item.menuItemId && catalog[item.menuItemId]) || [];

    if (!groups.length && !catalog[item.menuItemId ?? ""]) {
      unresolved.push({ menuItemName: item.menuItemName });
    }

    const selections = selectionsFor(item, groups, (groupName, optionName) => {
      unresolved.push({ menuItemName: item.menuItemName, groupName, optionName });
    });

    // The only identity both writers honour. Never read `item.price`.
    const unitPrice = round2(item.subtotal / item.quantity);
    const modifierTotal = selections.reduce((sum, s) => sum + s.priceModifier, 0);

    return addLine(cart, {
      menuItemId: item.menuItemId ?? "",
      name: item.menuItemName,
      basePrice: round2(unitPrice - modifierTotal),
      quantity: item.quantity,
      selections,
      ...(item.specialInstructions ? { note: item.specialInstructions } : {}),
    });
  }, []);

  return { lines, unresolved };
}

/**
 * Is this selection an add-on rather than a variation?
 *
 * The unified modifier model already draws this line by selection rule:
 * `max_select === 1` is variation-style, anything else is add-on style (see
 * `modifier-groups.ts`). Deriving it from the live group means a line the
 * cashier just added through ModifierSheet serialises the same way a hydrated
 * one does — there is no historical flag to keep in sync.
 *
 * An option orphaned out of the order's `addons` array stays an add-on; an
 * orphaned variation stays a variation.
 */
function isAddonSelection(selection: PosCartSelection, catalog: ModifierCatalog): boolean {
  for (const groups of Object.values(catalog)) {
    const group = groups.find((candidate) => candidate.id === selection.groupId);
    if (group) return group.max_select !== 1;
  }
  return selection.groupName === ORPHAN_GROUP;
}

/** Split cart selections back into the order's variation and add-on shapes. */
function partitionSelections(
  line: PosCartLine,
  catalog: ModifierCatalog,
): {
  variationSelections?: OrderVariationSelection[];
  addons?: OrderAddon[];
} {
  const variations: OrderVariationSelection[] = [];
  const addons: OrderAddon[] = [];

  for (const selection of line.selections) {
    if (isAddonSelection(selection, catalog)) {
      addons.push({ name: selection.optionName, price: selection.priceModifier });
      continue;
    }
    variations.push({
      typeName: selection.groupName,
      optionName: selection.optionName,
      priceAdjustment: selection.priceModifier,
    });
  }

  return {
    ...(variations.length ? { variationSelections: variations } : {}),
    ...(addons.length ? { addons } : {}),
  };
}

/**
 * Write the edited cart back out as order items.
 *
 * `price` is the LOADED unit price — the web convention — so the server's
 * `subtotal === price x quantity` revalidation holds for edited orders
 * regardless of which surface originally created them.
 */
export function posCartToOrderItems(
  lines: readonly PosCartLine[],
  catalog: ModifierCatalog = {},
): RevisedOrderItem[] {
  return lines.map((line) => ({
    menuItemId: line.menuItemId,
    menuItemName: line.name,
    quantity: line.quantity,
    price: line.unitPrice,
    subtotal: line.subtotal,
    ...(line.note ? { specialInstructions: line.note } : {}),
    ...partitionSelections(line, catalog),
  }));
}
