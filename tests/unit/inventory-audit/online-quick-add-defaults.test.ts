/**
 * Audit (2026-10-13): one-tap adds from the diner offers ("Goes well with…"
 * AddedSheet and the cart's last-call row, cart-offers-section.tsx:88 /
 * product-detail-content.tsx:1034) call `addItem(item, undefined, [], 1)` —
 * no selections at all. `needsChoices` only routes the diner to the product
 * page when a group is REQUIRED, so a dish whose optional groups have DEFAULT
 * picks (the product page pre-selects them via `getDefaultSelection`) is added
 * without them, and the default options' recipes are never spent.
 */
import { makeCartItem } from '@/lib/cart-utils'
import { getDefaultSelection, mapSelectionToCartFormat } from '@/lib/modifier-groups-cart'
import { buildCartLineOrderItem } from '@/lib/checkout/order-items-payload'
import { needsChoices, oneTapSelection } from '@/lib/boost/offer-items'
import type { MenuItem, ModifierGroup } from '@/types/database'

const sugar: ModifierGroup = {
  id: 'sugar', name: 'Sugar level', min_select: 0, max_select: 1, display_order: 0,
  options: [
    { id: 'full', name: '100%', price_modifier: 0, is_default: true, display_order: 0 },
    { id: 'half', name: '50%', price_modifier: 0, display_order: 1 },
  ],
}
const pearls: ModifierGroup = {
  id: 'pearls', name: 'Sinkers', selection_mode: 'quantity', min_select: 0, max_select: null, display_order: 1,
  options: [{ id: 'tapioca', name: 'Tapioca pearls', price_modifier: 0, is_default: true, display_order: 0 }],
}
const milkTea: MenuItem = {
  id: 'milk-tea', tenant_id: 't1', category_id: 'drinks', name: 'Milk Tea', description: '', price: 120,
  image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [], modifier_groups: [sugar, pearls],
}

describe('one-tap offer adds vs. default option picks', () => {
  it('a one-tap add carries the same option ids the product page would have pre-selected', () => {
    // The product page's add for an untouched dish.
    const defaults = mapSelectionToCartFormat([sugar, pearls], getDefaultSelection([sugar, pearls]))
    const fromProductPage = buildCartLineOrderItem(
      makeCartItem(milkTea, defaults.selectedVariations, defaults.selectedAddons, 1),
    )
    expect(fromProductPage.option_ids).toEqual(['full'])
    expect(fromProductPage.addon_ids).toEqual(['tapioca'])

    // The offer row adds it in one tap because nothing is required — with the
    // picks the product page would have seeded (oneTapSelection, used by the
    // AddedSheet and the cart's last-call row).
    expect(needsChoices(milkTea)).toBe(false)
    const oneTap = oneTapSelection(milkTea)
    const fromOffer = buildCartLineOrderItem(makeCartItem(milkTea, oneTap.variations, oneTap.addons, 1))

    // Was [] / [] (the offers called addItem(item, undefined, [], 1)): the
    // pearl and sugar recipes were never deducted for a drink added from
    // "Goes well with…" or the cart's last call. Fixed 2026-10-13.
    expect(fromOffer.option_ids).toEqual(fromProductPage.option_ids)
    expect(fromOffer.addon_ids).toEqual(fromProductPage.addon_ids)
  })
})
