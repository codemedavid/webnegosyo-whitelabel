'use client'

import { memo } from 'react'
import { Pencil } from 'lucide-react'
import { CategoryIcon } from '@/components/shared/category-icon'
import { resolveCategoryNavStyle } from '@/lib/storefront-theme'

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
  /**
   * Presentation style for the tabs. `'theme'`/undefined keeps today's
   * soft-tinted pills byte-identical; `chips`/`underline` are opt-in variants.
   */
  navStyle?: string
  isBrandAdmin?: boolean
  onEditBrandingSection?: () => void
}

type NavVariant = 'pills' | 'chips' | 'underline'

interface TabStyles {
  className: string
  style: React.CSSProperties
  hoverIn: React.CSSProperties | null
  hoverOut: React.CSSProperties | null
}

// Per-variant presentation. `pills` (and the resolved-null default) reproduce the
// original markup exactly, so an unset nav style changes nothing.
function tabPresentation(
  variant: NavVariant,
  isActive: boolean,
  primary: string,
  secondary: string
): TabStyles {
  if (variant === 'chips') {
    return {
      className: 'rounded-full border px-4 py-2.5',
      style: isActive
        ? { backgroundColor: primary, color: '#ffffff', borderColor: primary }
        : { backgroundColor: 'transparent', color: secondary, borderColor: `${secondary}40` },
      hoverIn: isActive ? null : { color: primary, borderColor: primary },
      hoverOut: isActive ? null : { color: secondary, borderColor: `${secondary}40` },
    }
  }

  if (variant === 'underline') {
    return {
      className: 'rounded-none border-b-2 px-1 py-2',
      style: isActive
        ? { backgroundColor: 'transparent', color: primary, borderColor: primary }
        : { backgroundColor: 'transparent', color: secondary, borderColor: 'transparent' },
      hoverIn: isActive ? null : { color: primary },
      hoverOut: isActive ? null : { color: secondary },
    }
  }

  // pills (default): original soft-tinted look
  return {
    className: 'rounded-full px-4 py-2.5',
    style: isActive
      ? { backgroundColor: `${primary}15`, color: primary }
      : { backgroundColor: 'transparent', color: secondary },
    hoverIn: isActive ? null : { color: primary, backgroundColor: `${primary}15` },
    hoverOut: isActive ? null : { color: secondary, backgroundColor: 'transparent' },
  }
}

export const CategoryTabs = memo(function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
  branding,
  navStyle,
  isBrandAdmin = false,
  onEditBrandingSection,
}: CategoryTabsProps) {
  const primaryColor = branding?.menuCategoryActive || branding?.primary || '#ea580c'
  const textSecondary = branding?.menuCategoryInactive || '#6b7280'
  const variant: NavVariant = resolveCategoryNavStyle(navStyle) ?? 'pills'

  const renderTab = (
    key: string,
    label: string,
    isActive: boolean,
    onClick: () => void,
    icon?: string,
    iconColor?: string
  ) => {
    const p = tabPresentation(variant, isActive, primaryColor, textSecondary)
    return (
      <button
        key={key}
        className={`flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-all shrink-0 ${p.className}`}
        style={p.style}
        onMouseEnter={(e) => {
          if (p.hoverIn) Object.assign(e.currentTarget.style, p.hoverIn)
        }}
        onMouseLeave={(e) => {
          if (p.hoverOut) Object.assign(e.currentTarget.style, p.hoverOut)
        }}
        onClick={onClick}
      >
        {icon && (
          <CategoryIcon icon={icon} color={iconColor} fallbackColor={primaryColor} size="sm" />
        )}
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 pb-2 -mx-1 px-1">
      <div className="flex gap-3 overflow-x-auto scrollbar-hide">
        {renderTab('__all__', 'All Items', !activeCategory, () => onCategoryChange(null))}
        {categories.map((category) =>
          renderTab(
            category.id,
            category.name,
            activeCategory === category.id,
            () => onCategoryChange(category.id),
            category.icon,
            category.icon_color
          )
        )}
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
