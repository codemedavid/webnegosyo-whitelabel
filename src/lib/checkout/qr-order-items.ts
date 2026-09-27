/**
 * Cart → QR-handoff payload lines. Pure; moved out of useCheckout unchanged so
 * the QR payload can be tested without rendering checkout.
 */
import { addonQuantity } from '@/lib/addon-quantity'
import { calculateCartItemUnitPrice, getEffectiveItemPrice } from '@/lib/cart-utils'
import { extractBundleSlotSelectionIds, extractSelectionIds } from '@/lib/inventory/order-item-selection'
import type { CartBundleItem, CartItem } from '@/types/database'
import type { QrOrderItemV1 } from '@/types/qr-order'

type VariationSelections = NonNullable<QrOrderItemV1['variationSelections']>

interface NamedModifier {
  name: string
  price_modifier: number
}

function describeVariations(options: readonly NamedModifier[]): {
  text: string
  selections: VariationSelections
  priceAdjustment: number
} {
  return {
    text: options.map((option) => option.name).join(', '),
    selections: options.map((option) => ({
      typeName: 'Variation',
      optionName: option.name,
      priceAdjustment: option.price_modifier,
    })),
    priceAdjustment: options.reduce((sum, option) => sum + option.price_modifier, 0),
  }
}

function cartItemVariations(item: CartItem): NamedModifier[] {
  if (item.selected_variation) return [item.selected_variation]
  if (item.selected_variations) return Object.values(item.selected_variations)
  return []
}

function slotVariations(slot: CartBundleItem['slots'][number]): NamedModifier[] {
  if (slot.selectedVariation) return [slot.selectedVariation]
  if (slot.selectedVariations) return Object.values(slot.selectedVariations)
  return []
}

function qrAddons(addons: CartItem['selected_addons']): Pick<QrOrderItemV1, 'addons'> {
  return addons.length > 0
    ? { addons: addons.map((addon) => ({ name: addon.name, price: addon.price, quantity: addonQuantity(addon) })) }
    : {}
}

function qrVariationFields(text: string, selections: VariationSelections): Partial<QrOrderItemV1> {
  return {
    ...(selections.length > 0 ? { variationSelections: selections } : {}),
    ...(text ? { variation: text } : {}),
  }
}

function toQrItem(item: CartItem): QrOrderItemV1 {
  const basePrice = getEffectiveItemPrice(item.menu_item)
  // Per-unit price MUST include add-ons: the server enforces
  // subtotal = price × quantity, so an add-on missing here is deleted from the
  // customer's total.
  const price = calculateCartItemUnitPrice(
    basePrice,
    item.selected_variations ?? item.selected_variation,
    item.selected_addons
  )
  const variations = describeVariations(cartItemVariations(item))

  return {
    menuItemId: item.menu_item.id,
    menuItemName: item.menu_item.name,
    quantity: item.quantity,
    price,
    basePrice,
    subtotal: item.subtotal,
    ...qrVariationFields(variations.text, variations.selections),
    ...qrAddons(item.selected_addons),
    ...(item.special_instructions ? { specialInstructions: item.special_instructions } : {}),
    ...(item.upsellSource ? { isUpsellItem: true } : {}),
  }
}

function toQrBundleItems(bundle: CartBundleItem): QrOrderItemV1[] {
  return bundle.slots.map((slot) => {
    const variations = describeVariations(slotVariations(slot))
    const slotPrice = slot.priceOverride + variations.priceAdjustment
    const addonTotal = slot.selectedAddons.reduce((sum, addon) => sum + addon.price * addonQuantity(addon), 0)
    const quantity = slot.quantity * bundle.quantity

    return {
      menuItemId: slot.menuItemId,
      menuItemName: slot.menuItemName,
      quantity,
      basePrice: slot.priceOverride,
      price: slotPrice + addonTotal,
      subtotal: (slotPrice + addonTotal) * quantity,
      ...qrVariationFields(variations.text, variations.selections),
      ...qrAddons(slot.selectedAddons),
      isBundleItem: true,
      bundleId: bundle.bundleId,
      bundleName: bundle.bundleName,
      slotName: slot.slotName,
    }
  })
}

/** Every cart line and bundle slot as a QR payload line (same shape as the Messenger path). */
export function buildQrOrderItems(items: readonly CartItem[], bundleItems: readonly CartBundleItem[]): QrOrderItemV1[] {
  return [...items.map(toQrItem), ...bundleItems.flatMap(toQrBundleItems)]
}

export interface InventorySelection {
  menu_item_id: string
  quantity: number
  option_ids: string[]
  addon_ids: string[]
  addon_quantities?: Record<string, number>
}

/** The option/add-on ids inventory depletion resolves recipes against. */
export function buildInventorySelections(
  items: readonly CartItem[],
  bundleItems: readonly CartBundleItem[]
): InventorySelection[] {
  const fromItems = items.map((item) => {
    const selected = extractSelectionIds(item)
    return {
      menu_item_id: item.menu_item.id,
      quantity: item.quantity,
      option_ids: selected.optionIds,
      addon_ids: selected.addonIds,
      addon_quantities: selected.addonQuantities,
    }
  })
  const fromBundles = bundleItems.flatMap((bundle) =>
    bundle.slots.map((slot) => {
      const selected = extractBundleSlotSelectionIds(slot)
      return {
        menu_item_id: slot.menuItemId,
        quantity: slot.quantity * bundle.quantity,
        option_ids: selected.optionIds,
        addon_ids: selected.addonIds,
        addon_quantities: selected.addonQuantities,
      }
    })
  )
  return [...fromItems, ...fromBundles]
}
