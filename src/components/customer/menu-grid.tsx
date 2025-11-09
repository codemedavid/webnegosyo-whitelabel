'use client'

import { MenuItemCard } from './menu-item-card'
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
}

export function MenuGrid({ items, onItemSelect, branding, template = 'classic' }: MenuGridProps) {
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

  // Adjust grid layout for compact template
  const gridClass = template === 'compact' 
    ? "grid gap-4 sm:grid-cols-1 lg:grid-cols-2" 
    : "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"

  return (
    <div className={gridClass}>
      {items.map((item) => (
        <MenuItemCard 
          key={item.id} 
          item={item} 
          onSelect={onItemSelect} 
          branding={branding}
          template={template}
        />
      ))}
    </div>
  )
}

