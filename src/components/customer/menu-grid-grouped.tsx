'use client'

import { memo, useMemo } from 'react'
import { MenuItemCard } from './menu-item-card'
import { EmptyState } from '@/components/shared/empty-state'
import { Pencil, UtensilsCrossed } from 'lucide-react'
import { CategoryIcon } from '@/components/shared/category-icon'
import type { MenuItem, Category } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { groupMenuItemsByCategory } from '@/lib/menu-grouping'
import { HorizontalScrollSection } from './horizontal-scroll-section'
import { ResponsiveCategorySection } from './responsive-category-section'

interface MenuGridGroupedProps {
  items: MenuItem[]
  categories: Category[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  mobileGridColumns?: number
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  isBrandAdmin?: boolean
  onEditCategoryHeader?: () => void
}

export const MenuGridGrouped = memo(function MenuGridGrouped({
  items,
  categories,
  onItemSelect,
  branding,
  template = 'classic',
  mobileGridColumns = 2,
  menuEngineeringEnabled,
  hideCurrencySymbol,
  isBrandAdmin = false,
  onEditCategoryHeader,
}: MenuGridGroupedProps) {
  const groupedItems = useMemo(
    () =>
      groupMenuItemsByCategory({
        items,
        categories,
        uncategorizedCategory: { id: 'uncategorized', name: 'Other Items', icon: '🍽️' },
      }),
    [items, categories]
  )

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
    <div className="space-y-12">
      {groupedItems.map(({ category, items: categoryItems }) => (
        <section
          key={category.id}
          id={`category-${category.id}`}
          className="scroll-mt-24 space-y-6"
        >
          {/* Category Header */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${branding.primary}15` }}
            >
              <CategoryIcon
                icon={category.icon || '🍽️'}
                color={category.icon_color}
                fallbackColor={branding.primary}
                size="md"
              />
            </div>
            <div>
              <h2
                className="text-2xl font-bold"
                style={{ color: branding.menuCategoryHeader }}
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
            {isBrandAdmin && onEditCategoryHeader && (
              <button
                type="button"
                onClick={onEditCategoryHeader}
                title="Edit category header colors"
                aria-label="Edit category header colors"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Menu Items Grid or Horizontal Scroll */}
          <ResponsiveCategorySection
            displayLayout={category.display_layout}
            horizontalContent={
              <HorizontalScrollSection
                items={categoryItems}
                onItemSelect={onItemSelect}
                branding={branding}
                template={template}
                menuEngineeringEnabled={menuEngineeringEnabled}
                hideCurrencySymbol={hideCurrencySymbol}
              />
            }
            gridContent={
              <div className={`grid gap-3 md:gap-6 lg:grid-cols-3 ${mobileGridColumns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {categoryItems.map((item) => (
                  <MenuItemCard
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
            }
          />
        </section>
      ))}
    </div>
  )
})
