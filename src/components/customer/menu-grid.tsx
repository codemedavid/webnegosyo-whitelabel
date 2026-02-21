'use client'

import { memo } from 'react'
import { PrefetchingCard } from './prefetching-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UtensilsCrossed } from 'lucide-react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface MenuGridProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  mobileGridColumns?: number
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

export const MenuGrid = memo(function MenuGrid({ items, onItemSelect, branding, template = 'classic', mobileGridColumns = 2, menuEngineeringEnabled, hideCurrencySymbol }: MenuGridProps) {
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
    <div className={gridClass}>
      {items.map((item) => (
        <PrefetchingCard
          key={item.id}
          item={item}
          onSelect={onItemSelect}
          branding={branding}
          template={template}
          menuEngineeringEnabled={menuEngineeringEnabled}
          hideCurrencySymbol={hideCurrencySymbol}
        />
      ))}
    </div>
  )
})
