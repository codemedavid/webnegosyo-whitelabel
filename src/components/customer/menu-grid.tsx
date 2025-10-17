'use client'

import { MenuItemCard } from './menu-item-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UtensilsCrossed } from 'lucide-react'
import type { MenuItem } from '@/types/database'

interface MenuGridProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
}

export function MenuGrid({ items, onItemSelect }: MenuGridProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="No items found"
        description="Try adjusting your search or filters"
      />
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <MenuItemCard key={item.id} item={item} onSelect={onItemSelect} />
      ))}
    </div>
  )
}

