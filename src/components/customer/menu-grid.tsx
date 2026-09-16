'use client'

import { memo } from 'react'
import { PrefetchingCard } from './prefetching-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UtensilsCrossed } from 'lucide-react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { ABOVE_THE_FOLD_CARD_COUNT } from '@/lib/above-the-fold'

/**
 * Cards likely to sit in the first mobile viewport (2 columns x 2 rows). Their
 * images load eagerly with high fetch priority so the LCP image is not lazy.
 */
export { ABOVE_THE_FOLD_CARD_COUNT }

interface MenuGridProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
  tenantSlug: string
  branding: BrandingColors
  template?: CardTemplate
  mobileGridColumns?: number
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

export const MenuGrid = memo(function MenuGrid({ items, onItemSelect, tenantSlug, branding, template = 'classic', mobileGridColumns = 2, menuEngineeringEnabled, hideCurrencySymbol }: MenuGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <EmptyState
          icon={UtensilsCrossed}
          title="No items found"
          description="Try adjusting your search or filters"
        />
      </div>
    )
  }

  // Adjust grid layout based on mobile columns setting
  const gridClass = `grid gap-3 md:gap-6 lg:grid-cols-3 ${mobileGridColumns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`

  return (
    <div className={gridClass} data-branding-scope="storefront/cards">
      {items.map((item, index) => (
        <PrefetchingCard
          key={item.id}
          item={item}
          priority={index < ABOVE_THE_FOLD_CARD_COUNT}
          onSelect={onItemSelect}
          tenantSlug={tenantSlug}
          branding={branding}
          template={template}
          menuEngineeringEnabled={menuEngineeringEnabled}
          hideCurrencySymbol={hideCurrencySymbol}
        />
      ))}
    </div>
  )
})
