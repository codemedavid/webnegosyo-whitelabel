'use client'

import { MenuItemCard } from './menu-item-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UtensilsCrossed } from 'lucide-react'
import type { MenuItem, Category } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

interface MenuGridGroupedProps {
  items: MenuItem[]
  categories: Category[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
}

export function MenuGridGrouped({ items, categories, onItemSelect, branding }: MenuGridGroupedProps) {
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

  // Group items by category
  const groupedItems = categories.reduce((acc, category) => {
    const categoryItems = items.filter(item => item.category_id === category.id)
    if (categoryItems.length > 0) {
      acc.push({ category, items: categoryItems })
    }
    return acc
  }, [] as Array<{ category: Category; items: MenuItem[] }>)

  // Add items without category at the end
  const uncategorizedItems = items.filter(item => !item.category_id)
  if (uncategorizedItems.length > 0) {
    groupedItems.push({
      category: { id: 'uncategorized', name: 'Other Items', icon: '🍽️' } as Category,
      items: uncategorizedItems
    })
  }

  return (
    <div className="space-y-12">
      {groupedItems.map(({ category, items: categoryItems }) => (
        <section key={category.id} className="space-y-6">
          {/* Category Header */}
          <div className="flex items-center gap-3">
            <div 
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${branding.primary}15` }}
            >
              <span className="text-2xl">{category.icon || '🍽️'}</span>
            </div>
            <div>
              <h2 
                className="text-2xl font-bold"
                style={{ color: branding.primary }}
              >
                {category.name}
              </h2>
              <p 
                className="text-sm"
                style={{ color: branding.textMuted }}
              >
                {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categoryItems.map((item) => (
              <MenuItemCard 
                key={item.id} 
                item={item} 
                onSelect={onItemSelect} 
                branding={branding}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
