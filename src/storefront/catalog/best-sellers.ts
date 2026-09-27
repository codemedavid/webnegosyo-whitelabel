import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import type { MenuItem } from '@/types/database'

const DEFAULT_BEST_SELLER_COUNT = 8

interface BestSellerOptions {
  menuEngineeringEnabled?: boolean
  limit?: number
}

/**
 * The items a storefront home shows as its best sellers, ranked by the
 * merchant's own signals in order of how deliberately they were set: featured,
 * then menu-engineering stars (only while that feature is on), then badged
 * items, then menu order. Unorderable items are left out. Pass the branch-
 * adjusted items from the menu controller, so a branch's own menu is honored.
 */
export function selectBestSellers(
  items: readonly MenuItem[],
  { menuEngineeringEnabled = false, limit = DEFAULT_BEST_SELLER_COUNT }: BestSellerOptions = {}
): MenuItem[] {
  const rank = (item: MenuItem) => {
    if (item.is_featured) return 0
    if (menuEngineeringEnabled && item.bcg_classification === 'star') return 1
    if (item.badge_text) return 2
    return 3
  }
  return items
    .filter(isMenuItemOrderable)
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order) // sorts the filtered copy
    .slice(0, limit)
}
