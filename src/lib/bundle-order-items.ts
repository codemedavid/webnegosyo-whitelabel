/**
 * Flattening bundle cart items into order items — WITH their selection ids.
 *
 * Extracted from the inline loop in `useCheckout` (Phase 4 order save), where
 * bundle-slot rows were pushed without `option_ids` / `addon_ids` while
 * regular items carried them — so a bundled item depleted only its base
 * recipe. Pricing and display strings are byte-identical to the old loop; the
 * ids are the addition.
 *
 * Pure and side-effect free.
 */

import type { CartBundleItem, CartBundleSlotSelection } from '@/types/database'
import { extractBundleSlotSelectionIds } from '@/lib/inventory/order-item-selection'

/** One flattened slot, in the shape `createOrderAction` order items expect. */
export interface BundleOrderItem {
  menu_item_id: string
  menu_item_name: string
  variation?: string
  addons: string[]
  quantity: number
  price: number
  subtotal: number
  special_instructions?: string
  option_ids: string[]
  addon_ids: string[]
  isBundleItem: true
  bundleId: string
  bundleName: string
  slotName: string
}

function slotPricing(slot: CartBundleSlotSelection): {
  unitPrice: number
  variationText: string
} {
  let price = slot.priceOverride
  let variationText = ''

  if (slot.selectedVariation) {
    price += slot.selectedVariation.price_modifier
    variationText = slot.selectedVariation.name
  } else if (slot.selectedVariations) {
    const options = Object.values(slot.selectedVariations)
    price += options.reduce((sum, option) => sum + option.price_modifier, 0)
    variationText = options.map((option) => option.name).join(', ')
  }

  const addonTotal = slot.selectedAddons.reduce((sum, addon) => sum + addon.price, 0)

  return { unitPrice: price + addonTotal, variationText }
}

/** Every bundle's slots as order items, provenance and selection ids intact. */
export function flattenBundleOrderItems(
  bundles: readonly CartBundleItem[],
): BundleOrderItem[] {
  return bundles.flatMap((bundle) =>
    bundle.slots.map((slot) => {
      const { unitPrice, variationText } = slotPricing(slot)
      const quantity = slot.quantity * bundle.quantity
      const selection = extractBundleSlotSelectionIds(slot)

      return {
        menu_item_id: slot.menuItemId,
        menu_item_name: slot.menuItemName,
        variation: variationText || undefined,
        addons: slot.selectedAddons.map((addon) => addon.name),
        quantity,
        price: unitPrice,
        subtotal: unitPrice * quantity,
        special_instructions: undefined,
        option_ids: selection.optionIds,
        addon_ids: selection.addonIds,
        isBundleItem: true as const,
        bundleId: bundle.bundleId,
        bundleName: bundle.bundleName,
        slotName: slot.slotName,
      }
    }),
  )
}
