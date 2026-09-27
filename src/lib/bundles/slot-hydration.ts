/**
 * Filling bundle slots with the dishes they offer.
 *
 * This used to be a nested loop in `getMenuData` that awaited one `menu_items`
 * query per slot — inside the ISR render of the storefront menu, so a tenant
 * with three four-slot bundles paid twelve serial round-trips before the page
 * could be returned. Every one of those queries differed only in which category
 * it asked for.
 *
 * The caller now reuses its tenant catalog. Explicit choices can span
 * categories, matching getSlotItems; category is only the fallback.
 */

import type { BundleWithSlots, MenuItem } from '@/types/database'

/** Every category a slot offers from, de-duplicated. The query's `in` list. */
export function collectSlotCategoryIds(bundles: readonly BundleWithSlots[]): string[] {
  const ids = new Set<string>()
  for (const bundle of bundles) {
    for (const slot of bundle.slots ?? []) {
      if (slot.category_id) ids.add(slot.category_id)
    }
  }
  return [...ids]
}

/**
 * Returns new bundles with every slot's `items` filled from `itemPool`.
 *
 * `itemPool` is expected to already carry the caller's filters (tenant,
 * availability) and ordering — a slot *offers* a dish rather than listing it,
 * so an out-of-stock dish belongs nowhere in here. Order is preserved because
 * filtering an ordered array keeps it ordered.
 */
export function hydrateBundleSlots(
  bundles: readonly BundleWithSlots[],
  itemPool: readonly MenuItem[],
): BundleWithSlots[] {
  const byCategory = new Map<string, MenuItem[]>()
  const byId = new Map(itemPool.map((item, index) => [item.id, { item, index }]))
  for (const menuItem of itemPool) {
    const categoryId = menuItem.category_id
    if (!categoryId) continue
    const bucket = byCategory.get(categoryId)
    if (bucket) bucket.push(menuItem)
    else byCategory.set(categoryId, [menuItem])
  }

  return bundles.map((bundle) => ({
    ...bundle,
    slots: (bundle.slots ?? []).map((slot) => {
      const candidates = byCategory.get(slot.category_id) ?? []
      // An empty `included_item_ids` meant "no `.in()` filter" to the old
      // query — the whole category — not "no dishes".
      const allowed = slot.included_item_ids
      const items =
        allowed && allowed.length > 0
          ? [...new Set(allowed)]
              .flatMap(id => { const entry = byId.get(id); return entry ? [entry] : [] })
              .sort((a, b) => a.index - b.index)
              .map(entry => entry.item)
          : [...candidates]

      return { ...slot, items }
    }),
  }))
}
