import type { MenuItem } from '@/types/database'

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
  return false
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
