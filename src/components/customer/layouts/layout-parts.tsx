'use client'

/**
 * Shared building blocks for the scroll-based catalog layouts
 * (storefront, kiosk, rails, lookbook): category grouping, the card grid
 * with above-the-fold priority, promo banners, keeping the chip bar's active
 * chip in view, and the empty state.
 */

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { MenuItemCard } from '../menu-item-card'
import { groupMenuItemsByCategory, type GroupedMenuItems } from '@/lib/menu-grouping'
import { resolveCategoryCardTemplate } from '@/lib/category-card-template'
import { isAboveTheFold } from '@/lib/above-the-fold'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import type { MenuItem, PromotionBanner, Tenant } from '@/types/database'
import type { MenuLayoutContentProps } from '@/storefront/contracts'
import { readableOn as readableTextOn } from '@/lib/card-color'

/** Section jump target sits below the sticky header plus the layout's own bar. */
export const SECTION_SCROLL_MARGIN: CSSProperties = {
  scrollMarginTop: 'calc(var(--menu-header-h, 4rem) + 5rem)',
}

export function useGroupedItems(items: MenuItem[], categories: MenuLayoutContentProps['categories']): GroupedMenuItems[] {
  return useMemo(
    () => groupMenuItemsByCategory({
      items,
      categories,
      uncategorizedCategory: { id: 'uncategorized', name: 'More to try', icon: '🍽️' },
    }),
    [items, categories]
  )
}

interface CategoryItemsGridProps {
  items: MenuItem[]
  category: GroupedMenuItems['category']
  gridClassName: string
  /** Page-order index of this grid's first card, for above-the-fold priority. */
  pageOffset: number
  branding: BrandingColors
  cardTemplate: CardTemplate
  onItemSelect: (item: MenuItem) => void
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  /** Extra classes per card index (e.g. a bento tile spanning two columns). */
  itemClassName?: (index: number) => string
}

/** A category's cards in the layout's grid, honouring per-category templates. */
export function CategoryItemsGrid({
  items, category, gridClassName, pageOffset, branding, cardTemplate, onItemSelect,
  menuEngineeringEnabled, hideCurrencySymbol, itemClassName,
}: CategoryItemsGridProps) {
  const template = resolveCategoryCardTemplate(category, cardTemplate)
  return (
    <div className={gridClassName}>
      {items.map((item, index) => (
        <div key={item.id} className={`h-full ${itemClassName?.(index) ?? ''}`}>
          <MenuItemCard
            item={item}
            onSelect={onItemSelect}
            branding={branding}
            template={template}
            menuEngineeringEnabled={menuEngineeringEnabled}
            hideCurrencySymbol={hideCurrencySymbol}
            priority={isAboveTheFold(pageOffset + index)}
          />
        </div>
      ))}
    </div>
  )
}

/** Mobile column choice → base grid columns for a layout's card grid. */
export function mobileColumnsClass(mobileGridColumns: number | undefined): string {
  return mobileGridColumns && mobileGridColumns >= 2 ? 'grid-cols-2' : 'grid-cols-1'
}

interface PromoBannerCarouselProps {
  tenant: Tenant | null
  bannerOverride: MenuLayoutContentProps['bannerOverride']
  currentSlide: number
  setCurrentSlide: (slide: number) => void
  className?: string
  aspectClassName?: string
}

/** The merchant's promotion banners as a crossfading carousel; nothing when off. */
export function PromoBannerCarousel({
  tenant, bannerOverride, currentSlide, setCurrentSlide, className = '', aspectClassName = 'aspect-[16/9] md:aspect-[21/8]',
}: PromoBannerCarouselProps) {
  const banners: PromotionBanner[] = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
  const isVisible = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && banners.length > 0
  if (!isVisible) return null

  return (
    <div className={`relative w-full overflow-hidden rounded-[var(--brand-radius,20px)] ${aspectClassName} ${className}`}>
      {banners.map((banner, index) => (
        <div
          key={banner.id}
          aria-hidden={index !== currentSlide}
          className={`absolute inset-0 transition-opacity duration-700 ${index === currentSlide ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {banner.imageUrl && (
            <OptimizedImage
              src={banner.imageUrl}
              alt={banner.title || `Promotion ${index + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 1200px"
              priority={index === 0}
            />
          )}
          {(banner.title || banner.description) && (
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5 md:p-10">
              {banner.title && (
                <h2 className="max-w-2xl text-2xl font-bold leading-tight text-white [text-wrap:balance] md:text-4xl">{banner.title}</h2>
              )}
              {banner.description && (
                <p className="mt-1.5 max-w-xl text-sm text-white md:text-lg">{banner.description}</p>
              )}
            </div>
          )}
        </div>
      ))}
      {banners.length > 1 && (
        <div className="absolute bottom-3 right-4 z-10 flex gap-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => setCurrentSlide(index)}
              aria-label={`Show promotion ${index + 1}`}
              aria-current={index === currentSlide}
              className={`h-1.5 rounded-full transition-all duration-300 ${index === currentSlide ? 'w-6 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Keeps the active chip of a horizontally scrolling nav in view as the page
 * scroll-spies through categories. Scrolls the strip only — never the page.
 */
export function useActiveChipInView(activeId: string | null) {
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !activeId) return
    const chip = Array.from(strip.querySelectorAll<HTMLElement>('[data-chip-id]'))
      .find((el) => el.dataset.chipId === activeId)
    if (!chip || typeof strip.scrollTo !== 'function') return
    // Measure against the strip itself: offsetLeft is relative to the nearest
    // positioned ancestor (the sticky nav), not to the scrolling strip.
    const chipLeft = chip.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft
    const target = chipLeft - strip.clientWidth / 2 + chip.clientWidth / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeId])
  return stripRef
}

interface LayoutEmptyStateProps {
  branding: BrandingColors
  hasFilters: boolean
  onClear: () => void
}

export function LayoutEmptyState({ branding, hasFilters, onClear }: LayoutEmptyStateProps) {
  return (
    <div className="mx-auto max-w-sm py-20 text-center">
      <h3 className="text-xl font-semibold" style={{ color: branding.textPrimary }}>
        {hasFilters ? 'Nothing matches that' : 'The menu is being prepared'}
      </h3>
      <p className="mt-2 text-sm" style={{ color: branding.textSecondary }}>
        {hasFilters ? 'Try a different word, or browse the whole menu.' : 'Check back soon — new dishes are on the way.'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-6 rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
        >
          Show the whole menu
        </button>
      )}
    </div>
  )
}

interface CategoryChipBarProps {
  groups: GroupedMenuItems[]
  activeId: string | null
  onSelect: (categoryId: string) => void
  branding: BrandingColors
  /** `pill`: filled chips with counts. `underline`: a quiet text index. */
  variant: 'pill' | 'underline'
  /** Rendered at the bar's end on wide screens (e.g. the search field). */
  trailing?: ReactNode
}

/** Sticky, horizontally scrolling category navigation that follows the page. */
export function CategoryChipBar({ groups, activeId, onSelect, branding, variant, trailing }: CategoryChipBarProps) {
  const stripRef = useActiveChipInView(activeId)
  const active = branding.menuCategoryActive || branding.primary
  const inactive = branding.menuCategoryInactive || branding.textSecondary

  return (
    <nav
      aria-label="Menu categories"
      data-branding-scope="storefront/category-nav"
      className="sticky z-30 -mx-4 mb-8 border-b px-4 backdrop-blur-md md:mb-12"
      style={{
        top: 'var(--menu-header-h, 0px)',
        backgroundColor: `color-mix(in srgb, ${branding.background} 90%, transparent)`,
        borderColor: branding.border,
      }}
    >
      <div className="flex items-center gap-4">
        <div ref={stripRef} className="scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto py-3">
          {groups.map(({ category, items }) => {
            const isActive = activeId === category.id
            if (variant === 'underline') {
              return (
                <button
                  key={category.id}
                  type="button"
                  data-chip-id={category.id}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => onSelect(category.id)}
                  className="relative shrink-0 whitespace-nowrap px-2 py-1.5 text-[14px] font-medium tracking-[-0.005em] transition-colors md:text-[15px]"
                  style={{ color: isActive ? active : inactive }}
                >
                  {category.name}
                  <span
                    aria-hidden
                    className={`absolute inset-x-2 -bottom-3 h-[2px] origin-left transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isActive ? 'scale-x-100' : 'scale-x-0'}`}
                    style={{ backgroundColor: active }}
                  />
                </button>
              )
            }
            return (
              <button
                key={category.id}
                type="button"
                data-chip-id={category.id}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelect(category.id)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors duration-200"
                style={isActive
                  ? { backgroundColor: active, borderColor: active, color: readableTextOn(active) }
                  : { backgroundColor: 'transparent', borderColor: branding.border, color: inactive }}
              >
                {category.name}
                <span className="text-[11px] font-medium tabular-nums opacity-70">{items.length}</span>
              </button>
            )
          })}
        </div>
        {trailing && <div className="hidden w-64 shrink-0 md:block">{trailing}</div>}
      </div>
    </nav>
  )
}
