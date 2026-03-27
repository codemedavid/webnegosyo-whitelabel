import type { MenuItem } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'

export interface BundleMenuItem extends MenuItem {
  _isBundle: true
  _bundleData: BundleWithSlots
}

/**
 * Map a BundleWithSlots to a MenuItem-compatible shape for card rendering.
 * Attaches `_isBundle` and `_bundleData` for click handler detection.
 */
export function bundleToMenuItem(bundle: BundleWithSlots): BundleMenuItem {
  const slots = bundle.slots ?? []

  // Calculate bundle price
  let bundlePrice: number
  if (bundle.pricing_type === 'fixed') {
    bundlePrice = bundle.fixed_price ?? 0
  } else {
    // For discount pricing, customer picks items — price determined at customization time
    bundlePrice = 0
  }

  // Auto-generate description from slot names
  const autoDescription = slots
    .map((s) => (s.pick_count > 1 ? `${s.pick_count}× ${s.name}` : s.name))
    .join(' + ')

  // Use bundle image
  const imageUrl = bundle.image_url || ''

  return {
    id: `bundle_${bundle.id}`,
    tenant_id: bundle.tenant_id,
    category_id: 'bundles',
    name: bundle.name,
    description: bundle.description || autoDescription,
    price: bundlePrice,
    discounted_price: undefined,
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
