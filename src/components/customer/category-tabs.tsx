'use client'

import { memo } from 'react'
import { Pencil } from 'lucide-react'
import { CategoryIcon } from '@/components/shared/category-icon'

interface CategoryLite {
  id: string
  name: string
  icon?: string
  icon_color?: string
}

interface CategoryTabsProps {
  categories: CategoryLite[]
  activeCategory: string | null
  onCategoryChange: (categoryId: string | null) => void
  branding?: {
    primary: string
    menuCategoryActive: string
    menuCategoryInactive: string
  }
  isBrandAdmin?: boolean
  onEditBrandingSection?: () => void
}

export const CategoryTabs = memo(function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
  branding,
  isBrandAdmin = false,
  onEditBrandingSection,
}: CategoryTabsProps) {
  const primaryColor = branding?.menuCategoryActive || branding?.primary || '#ea580c'
  const textSecondary = branding?.menuCategoryInactive || '#6b7280'

  return (
    <div className="flex items-center justify-between gap-3 pb-2 -mx-1 px-1">
      <div className="flex gap-3 overflow-x-auto scrollbar-hide">
        <button
          className="flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all shrink-0"
          style={{
            backgroundColor: !activeCategory ? `${primaryColor}15` : 'transparent',
            color: !activeCategory ? primaryColor : textSecondary,
          }}
          onMouseEnter={(e) => {
            if (activeCategory) {
              e.currentTarget.style.color = primaryColor
              e.currentTarget.style.backgroundColor = `${primaryColor}15`
            }
          }}
          onMouseLeave={(e) => {
            if (activeCategory) {
              e.currentTarget.style.color = textSecondary
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
          onClick={() => onCategoryChange(null)}
        >
          All Items
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className="flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all shrink-0"
            style={{
              backgroundColor:
                activeCategory === category.id ? `${primaryColor}15` : 'transparent',
              color: activeCategory === category.id ? primaryColor : textSecondary,
            }}
            onMouseEnter={(e) => {
              if (activeCategory !== category.id) {
                e.currentTarget.style.color = primaryColor
                e.currentTarget.style.backgroundColor = `${primaryColor}15`
              }
            }}
            onMouseLeave={(e) => {
              if (activeCategory !== category.id) {
                e.currentTarget.style.color = textSecondary
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
            onClick={() => onCategoryChange(category.id)}
          >
            {category.icon && (
              <CategoryIcon
                icon={category.icon}
                color={category.icon_color}
                fallbackColor={primaryColor}
                size="sm"
              />
            )}
            <span>{category.name}</span>
          </button>
        ))}
      </div>
      {isBrandAdmin && onEditBrandingSection && (
        <button
          type="button"
          onClick={onEditBrandingSection}
          title="Edit category navigation colors"
          aria-label="Edit category navigation colors"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
})
