'use client'

import { MenuItemCard } from './menu-item-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UtensilsCrossed } from 'lucide-react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

interface MenuGridProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
}

export function MenuGrid({ items, onItemSelect, branding }: MenuGridProps) {
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

  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <MenuItemCard 
          key={item.id} 
          item={item} 
          onSelect={onItemSelect} 
          branding={branding}
        />
      ))}
    </div>
  )
}

