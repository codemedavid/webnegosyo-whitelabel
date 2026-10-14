import type { Addon, MenuItem, ModifierGroup, VariationOption } from '@/types/database'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { getDefaultSelection, mapSelectionToCartFormat } from '@/lib/modifier-groups-cart'

/** The picks a one-tap add carries, in `addItem`'s argument shape. */
export interface OneTapSelection {
  variations: { [groupId: string]: VariationOption } | undefined
  addons: Addon[]
}

function explicitModifierGroups(item: MenuItem): ModifierGroup[] {
  if (!item.modifier_groups || item.modifier_groups.length === 0) return []
  return normalizeModifierGroups({ modifier_groups: item.modifier_groups })
}

/** The default options the product page would pre-select, per group. */
function defaultModifierPicks(groups: readonly ModifierGroup[]) {
  const selection = getDefaultSelection(groups)
  return groups.flatMap((group) =>
    (selection[group.id] ?? []).flatMap((id) => group.options.filter((option) => option.id === id)),
  )
}

/**
 * True when a dish cannot go into the cart without the diner choosing
 * something first — a required size, flavour or modifier. Such suggestions
 * open the dish instead of adding it. Optional add-ons never block a one-tap
 * add. (The old check treated any add-on as blocking and ignored modifier
 * groups entirely.)
 */
export function needsChoices(item: MenuItem): boolean {
  // A pre-order needs an allocated pickup date, even with no size or extras.
  if (item.presell_enabled) return true
  if ((item.variations?.length ?? 0) > 0) return true
  if (item.variation_types?.some((type) => type.is_required && (type.options?.length ?? 0) > 0)) return true
  if (item.modifier_groups?.some((group) => (group.min_select ?? 0) > 0)) return true
  // A default pick that is a linked dish is priced from that dish, which only
  // the product page loads — open it rather than add it at a guessed price.
  if (defaultModifierPicks(explicitModifierGroups(item)).some((option) => option.menu_item_id)) return true
  return false
}

/**
 * The picks a one-tap add must carry: exactly what the product page would have
 * pre-selected for an untouched dish (modifier-group defaults; or, for legacy
 * variation types, the default or first option of each), so the line costs and
 * spends stock the same whichever way it reached the cart. A dish with no
 * defaults adds with no picks, as before.
 */
export function oneTapSelection(item: MenuItem): OneTapSelection {
  const groups = explicitModifierGroups(item)
  if (groups.length > 0) {
    const cart = mapSelectionToCartFormat(groups, getDefaultSelection(groups))
    return { variations: cart.selectedVariations, addons: cart.selectedAddons }
  }

  const types = (item.variation_types ?? []).filter((type) => (type.options?.length ?? 0) > 0)
  if (types.length > 0) {
    return {
      variations: Object.fromEntries(
        types.map((type) => [type.id, type.options.find((option) => option.is_default) ?? type.options[0]]),
      ),
      addons: [],
    }
  }

  return { variations: undefined, addons: [] }
}

export interface OfferableOptions {
  excludeIds?: ReadonlySet<string>
  limit: number
}

/** Suggestions worth showing: in stock, not already in the order, no repeats. */
export function offerableItems<T extends Pick<MenuItem, 'id' | 'is_available'>>(
  items: readonly T[],
  { excludeIds, limit }: OfferableOptions
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (out.length >= limit) break
    if (item.is_available === false || seen.has(item.id) || excludeIds?.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** The "Added — goes well with…" sheet never shows more than this. */
export const MAX_POST_ADD_OFFERS = 4

/**
 * Pairings worth showing right after a dish goes in: not the dish itself and
 * nothing the diner already ordered. Taken at the moment of the add, so an
 * item tapped inside the sheet stays on screen marked "Added".
 */
export function postAddOffers<T extends Pick<MenuItem, 'id' | 'is_available'>>(
  pairings: readonly T[],
  { addedItemId, cartItemIds }: { addedItemId: string; cartItemIds: readonly string[] }
): T[] {
  return offerableItems(pairings, {
    excludeIds: new Set([addedItemId, ...cartItemIds]),
    limit: MAX_POST_ADD_OFFERS,
  })
}
