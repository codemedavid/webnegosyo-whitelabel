import type { MenuItem } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

export interface BundleMenuItem extends MenuItem {
  _isBundle: true
  _bundleData: BundleWithItems
}

/**
 * Map a BundleWithItems to a MenuItem-compatible shape for card rendering.
 * Attaches `_isBundle` and `_bundleData` for click handler detection.
 */
export function bundleToMenuItem(bundle: BundleWithItems): BundleMenuItem {
  const items = bundle.items ?? []

  // Calculate original total from component items
  const originalTotal = items.reduce(
    (sum, bi) => sum + (bi.menu_item?.price ?? 0) * bi.quantity,
    0
  )

  // Calculate bundle price
  let bundlePrice: number
  if (bundle.pricing_type === 'fixed') {
    bundlePrice = bundle.fixed_price ?? 0
  } else {
    const discountPercent = Math.min(bundle.discount_percent ?? 0, 100)
    bundlePrice = Math.max(0, Math.round(originalTotal * (1 - discountPercent / 100) * 100) / 100)
  }

  // Auto-generate description from item names if none provided
  const autoDescription = items
    .map((bi) => {
      const name = bi.menu_item?.name ?? 'Item'
      return bi.quantity > 1 ? `${bi.quantity}× ${name}` : name
    })
    .join(' + ')

  // Use bundle image, fall back to first item's image
  const imageUrl =
    bundle.image_url ||
    items[0]?.menu_item?.image_url ||
    ''

  return {
    id: `bundle_${bundle.id}`,
    tenant_id: bundle.tenant_id,
    category_id: 'bundles',
    name: bundle.name,
    description: bundle.description || autoDescription,
    price: bundlePrice,
    discounted_price: originalTotal > bundlePrice ? originalTotal : undefined,
    image_url: imageUrl,
    variation_types: [],
    variations: [],
    addons: [],
    is_available: bundle.is_active,
    is_featured: false,
    order: bundle.display_order,
    created_at: bundle.created_at,
    updated_at: bundle.updated_at,
    _isBundle: true,
    _bundleData: bundle,
  }
}

/** Type guard: is this MenuItem actually an adapted bundle? */
export function isBundleMenuItem(item: MenuItem): item is BundleMenuItem {
  return '_isBundle' in item && (item as BundleMenuItem)._isBundle === true
}
