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

interface CategorySubmenuProps {
  categories: CategoryLite[]
  activeCategory: string | null
  onCategoryChange: (categoryId: string | null) => void
  branding: {
    primary: string
    menuCategoryActive: string
    menuCategoryInactive: string
    header: string
    border: string
  }
  isBrandAdmin?: boolean
  onEditBrandingSection?: () => void
}

export const CategorySubmenu = memo(function CategorySubmenu({
  categories,
  activeCategory,
  onCategoryChange,
  branding,
  isBrandAdmin = false,
  onEditBrandingSection,
}: CategorySubmenuProps) {
  const activeColor = branding.menuCategoryActive || branding.primary
  const inactiveColor = branding.menuCategoryInactive || activeColor

  return (
    <nav
      className="sticky z-40 hidden md:block border-b backdrop-blur-sm"
      style={{
        top: 'var(--menu-header-h, 5rem)',
        backgroundColor: branding.header,
        borderColor: branding.border,
      }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex gap-6 overflow-x-auto scrollbar-hide">
          {/* All Items Button */}
            <button
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors rounded-md shrink-0"
              style={{
                color: !activeCategory ? activeColor : inactiveColor,
                backgroundColor: !activeCategory ? `${activeColor}15` : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (activeCategory) {
                  e.currentTarget.style.color = activeColor
                  e.currentTarget.style.backgroundColor = `${activeColor}15`
                }
              }}
              onMouseLeave={(e) => {
                if (activeCategory) {
                  e.currentTarget.style.color = inactiveColor
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
              onClick={() => onCategoryChange(null)}
            >
              All
            </button>

            {/* Category Buttons */}
            {categories.map((category) => (
              <button
                key={category.id}
                className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors rounded-md shrink-0"
                style={{
                  color:
                    activeCategory === category.id ? activeColor : inactiveColor,
                  backgroundColor:
                    activeCategory === category.id ? `${activeColor}15` : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (activeCategory !== category.id) {
                    e.currentTarget.style.color = activeColor
                    e.currentTarget.style.backgroundColor = `${activeColor}15`
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeCategory !== category.id) {
                    e.currentTarget.style.color = inactiveColor
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
                onClick={() => onCategoryChange(category.id)}
              >
                {category.icon && (
                  <CategoryIcon
                    icon={category.icon}
                    color={category.icon_color}
                    fallbackColor={activeColor}
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
      </div>
    </nav>
  )
})
