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
export function bundleToMenuItem(bundle: BundleWithSlots, allMenuItems?: MenuItem[]): BundleMenuItem {
  const slots = bundle.slots ?? []

  // Calculate min slot total from items (resolve from allMenuItems via included_item_ids)
  const minSlotTotal = slots.reduce((sum, slot) => {
    const items = slot.items?.length
      ? slot.items
      : allMenuItems
        ? (slot.included_item_ids ?? []).map((id) => allMenuItems.find((mi) => mi.id === id)).filter(Boolean) as MenuItem[]
        : []
    if (items.length === 0) return sum
    const minPrice = Math.min(...items.map((i) => i.price ?? 0))
    return sum + minPrice * (slot.pick_count ?? 1)
  }, 0)

  let bundlePrice: number
  let originalPrice: number | undefined
  if (bundle.pricing_type === 'fixed') {
    bundlePrice = bundle.fixed_price ?? 0
    originalPrice = minSlotTotal > bundlePrice ? minSlotTotal : undefined
  } else {
    bundlePrice = Math.round(minSlotTotal * (1 - (bundle.discount_percent ?? 0) / 100) * 100) / 100
    originalPrice = minSlotTotal > bundlePrice ? minSlotTotal : undefined
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
    price: originalPrice ?? bundlePrice,
    discounted_price: originalPrice ? bundlePrice : undefined,
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
