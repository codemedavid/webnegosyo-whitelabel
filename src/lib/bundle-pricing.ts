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
  return slots.reduce((sum, s) => {
    let variationExtra = 0
    if (s.selectedVariations) {
      variationExtra = Object.values(s.selectedVariations).reduce(
        (acc, opt) => acc + (opt as { price_modifier: number }).price_modifier, 0
      )
    } else if (s.selectedVariation) {
      variationExtra = s.selectedVariation.price_modifier || 0
    }
    const addonExtra = s.selectedAddons.reduce((acc, a) => acc + a.price, 0)
    return sum + s.priceOverride + variationExtra + addonExtra
  }, 0)
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
