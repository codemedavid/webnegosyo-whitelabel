import type { AppFeatures, AppHomeBlock, AppMenuItem, AppQuickAction } from '@/lib/contract'

export const MAX_FEATURED_ITEMS = 10

interface Audience {
  isMember: boolean
  features: AppFeatures
}

const LOYALTY_BLOCKS = new Set<AppHomeBlock['type']>(['memberCard', 'rewardsTeaser'])

function isActionEnabled(action: AppQuickAction, features: AppFeatures): boolean {
  switch (action) {
    case 'pickup':
      return features.ordering && features.orderModes.pickup
    case 'delivery':
      return features.ordering && features.orderModes.delivery
    case 'dineIn':
      return features.ordering && features.orderModes.dineIn
    case 'menu':
      return true
    case 'rewards':
    case 'scan':
      return features.loyalty
  }
}

/**
 * The home screen as this viewer should see it: audience-filtered, stripped of
 * features the store has switched off, and without blocks left empty by that.
 */
export function visibleBlocks(blocks: readonly AppHomeBlock[], { isMember, features }: Audience): AppHomeBlock[] {
  return blocks.flatMap((block): AppHomeBlock[] => {
    if (block.visibleWhen === 'guest' && isMember) return []
    if (block.visibleWhen === 'member' && !isMember) return []
    if (LOYALTY_BLOCKS.has(block.type) && !features.loyalty) return []
    if (block.type === 'orderAgain' && !features.ordering) return []
    if (block.type === 'bannerCarousel' && block.banners.length === 0) return []
    if (block.type === 'quickActions') {
      const actions = block.actions.filter((action) => isActionEnabled(action, features))
      return actions.length > 0 ? [{ ...block, actions }] : []
    }
    return [block]
  })
}

/** Items for a featured row: manual keeps the merchant's order; `featured` puts sold-out last. */
export function resolveFeaturedItems(
  block: { source: 'featured' | 'manual'; itemIds: readonly string[] },
  items: readonly AppMenuItem[],
): AppMenuItem[] {
  if (block.source === 'manual') {
    const byId = new Map(items.map((item) => [item.id, item]))
    return block.itemIds.flatMap((id) => byId.get(id) ?? []).slice(0, MAX_FEATURED_ITEMS)
  }
  const featured = items.filter((item) => item.isFeatured)
  return [...featured.filter((item) => item.isAvailable), ...featured.filter((item) => !item.isAvailable)].slice(
    0,
    MAX_FEATURED_ITEMS,
  )
}
