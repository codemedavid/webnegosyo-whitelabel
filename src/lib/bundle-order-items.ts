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

import { addonLabel } from '@/lib/addon-quantity'
import { calculateSlotUnitExtras } from '@/lib/bundle-pricing'
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
  addon_quantities?: Record<string, number>
  isBundleItem: true
  bundleId: string
  bundleName: string
  slotName: string
  bundleCartId: string
  bundleSlotId: string
  bundleQuantity: number
}

function slotPricing(slot: CartBundleSlotSelection): {
  unitPrice: number
  variationText: string
} {
  const variationText = slot.selectedVariations
    ? Object.values(slot.selectedVariations).map(option => option.name).join(', ')
    : slot.selectedVariation?.name ?? ''
  return { unitPrice: calculateSlotUnitExtras(slot), variationText }
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
        addons: slot.selectedAddons.map(addonLabel),
        quantity,
        price: unitPrice,
        subtotal: unitPrice * quantity,
        special_instructions: undefined,
        option_ids: selection.optionIds,
        addon_ids: selection.addonIds,
        ...(selection.addonQuantities ? { addon_quantities: selection.addonQuantities } : {}),
        isBundleItem: true as const,
        bundleId: bundle.bundleId,
        bundleName: bundle.bundleName,
        slotName: slot.slotName,
        bundleCartId: bundle.id,
        bundleSlotId: slot.slotId,
        bundleQuantity: bundle.quantity,
      }
    }),
  )
}
