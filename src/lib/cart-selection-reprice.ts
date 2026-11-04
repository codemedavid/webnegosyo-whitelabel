/**
 * Re-price a saved cart line's options and add-ons from the dish's current JSON.
 *
 * The cart refresh used to re-read only the dish's own price, so a cart filled
 * before the merchant raised an add-on kept showing the old figure while the
 * server (which prices from the menu, `order-line-modifier-pricing.ts`) billed
 * the new one. Matching is by option id, the same key the server uses.
 *
 * Linked options ("Add a Coke") are left alone: their price is the linked
 * dish's, which this read does not carry. A selection the dish no longer has is
 * left as it was. Pure; returns the SAME item when nothing changed, so the
 * caller can skip a re-render.
 */

import { normalizeModifierGroups, type ModifierSource } from '@/lib/modifier-groups'
import type { CartItem } from '@/types/database'

function currentPrices(source: ModifierSource): Map<string, number> {
  const entries = normalizeModifierGroups(source).flatMap((group) =>
    group.options
      .filter((option) => !option.menu_item_id && Number.isFinite(option.price_modifier))
      .map((option) => [option.id, option.price_modifier] as const)
  )
  return new Map(entries)
}

export function repriceCartSelections(item: CartItem, source: ModifierSource): CartItem {
  const prices = currentPrices(source)
  let hasChanged = false

  const priceOf = (id: string, current: number): number => {
    const next = prices.get(id)
    if (next === undefined || next === current) return current
    hasChanged = true
    return next
  }

  const selectedAddons = item.selected_addons.map((addon) => {
    const price = priceOf(addon.id, addon.price)
    return price === addon.price ? addon : { ...addon, price }
  })

  const selectedVariations = item.selected_variations
    ? Object.fromEntries(
        Object.entries(item.selected_variations).map(([groupId, option]) => {
          const price = priceOf(option.id, option.price_modifier)
          return [groupId, price === option.price_modifier ? option : { ...option, price_modifier: price }]
        })
      )
    : undefined

  const legacyVariation = item.selected_variation
  const legacyPrice = legacyVariation ? priceOf(legacyVariation.id, legacyVariation.price_modifier) : undefined
  const selectedVariation =
    legacyVariation && legacyPrice !== legacyVariation.price_modifier
      ? { ...legacyVariation, price_modifier: legacyPrice as number }
      : legacyVariation

  if (!hasChanged) return item
  return {
    ...item,
    selected_addons: selectedAddons,
    ...(selectedVariations ? { selected_variations: selectedVariations } : {}),
    ...(selectedVariation ? { selected_variation: selectedVariation } : {}),
  }
}
