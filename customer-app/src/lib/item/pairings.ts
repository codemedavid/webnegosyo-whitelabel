import type { AppCatalog, AppMenuItem } from '@/lib/contract'

export const MAX_PAIRINGS = 6

/**
 * "Goes well with" for the Added sheet: the merchant's pairings for the dish
 * (Boost Sales), else the featured dishes — never the dish itself, anything
 * already in the bag, or anything sold out.
 */
export function pairingsFor(catalog: AppCatalog, itemId: string, bagItemIds: readonly string[]): AppMenuItem[] {
  const excluded = new Set([itemId, ...bagItemIds])
  const byId = new Map(catalog.items.map((item) => [item.id, item]))
  const isOffered = (item: AppMenuItem | undefined): item is AppMenuItem =>
    item !== undefined && item.isAvailable && !excluded.has(item.id)

  const targetIds = catalog.pairings.find((pairing) => pairing.sourceItemId === itemId)?.targetItemIds ?? []
  const paired = targetIds.map((id) => byId.get(id)).filter(isOffered)
  const picks = paired.length > 0 ? paired : catalog.items.filter((item) => item.isFeatured).filter(isOffered)
  return picks.slice(0, MAX_PAIRINGS)
}
