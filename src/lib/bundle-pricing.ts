import { addonQuantity } from '@/lib/addon-quantity'
import type { CartBundleItem, CartBundleSlotSelection } from '@/types/database'

/**
 * Calculate the base price of a slot-based bundle (before customization extras)
 * - Fixed pricing: returns basePrice directly
 * - Discount pricing: sums slot menuItemPrices and applies discountPercent
 */
export function calculateSlotBundleBasePrice(bundleItem: CartBundleItem): number {
  if (bundleItem.pricingType === 'fixed') {
    return bundleItem.basePrice
  }
  const originalTotal = bundleItem.slots.reduce(
    (sum, s) => sum + s.menuItemPrice * s.quantity, 0
  )
  const discountPercent = Math.min(bundleItem.discountPercent ?? 0, 100)
  return Math.max(0, Math.round(originalTotal * (1 - discountPercent / 100) * 100) / 100)
}

/**
 * Calculate extras cost (price overrides + variation modifiers + addons) across all slots
 */
export function calculateSlotBundleExtras(slots: CartBundleSlotSelection[]): number {
  return slots.reduce((sum, slot) => sum + calculateSlotUnitExtras(slot) * slot.quantity, 0)
}

/** Shared by cart totals, the bundle review and flattened order lines. */
export function calculateSlotUnitExtras(slot: CartBundleSlotSelection): number {
  const variationExtra = slot.selectedVariations
    ? Object.values(slot.selectedVariations).reduce((sum, option) => sum + option.price_modifier, 0)
    : slot.selectedVariation?.price_modifier ?? 0
  const addonExtra = slot.selectedAddons.reduce((sum, addon) => sum + addon.price * addonQuantity(addon), 0)
  return slot.priceOverride + variationExtra + addonExtra
}

/**
 * Calculate the full subtotal for a slot-based cart bundle item
 */
export function calculateSlotBundleSubtotal(bundleItem: CartBundleItem): number {
  const base = calculateSlotBundleBasePrice(bundleItem)
  const extras = calculateSlotBundleExtras(bundleItem.slots)
  return Math.round((base + extras) * bundleItem.quantity * 100) / 100
}

/**
 * Calculate savings from a slot-based bundle
 */
export function calculateSlotBundleSavings(bundleItem: CartBundleItem): number {
  const originalTotal = bundleItem.slots.reduce(
    (sum, s) => sum + s.menuItemPrice * s.quantity, 0
  )
  const base = calculateSlotBundleBasePrice(bundleItem)
  return Math.max(0, Math.round((originalTotal - base) * 100) / 100)
}

/**
 * Get total savings across all slot-based bundle items in the cart
 */
export function calculateTotalSlotBundleSavings(bundleItems: CartBundleItem[]): number {
  return bundleItems.reduce(
    (total, bi) => total + calculateSlotBundleSavings(bi) * bi.quantity, 0
  )
}
