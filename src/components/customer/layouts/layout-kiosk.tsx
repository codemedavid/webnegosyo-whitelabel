'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'
import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { CategoryIcon } from '@/components/shared/category-icon'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { SearchBar } from '../search-bar'
import { categorySectionId, useCategoryScrollSpy } from '@/hooks/use-category-scroll-spy'
import { pageIndexOf } from '@/lib/above-the-fold'
import { readableOn, tint } from '@/lib/card-color'
import type { BrandingColors } from '@/lib/branding-utils'
import type { GroupedMenuItems } from '@/lib/menu-grouping'
import {
  CategoryItemsGrid, LayoutEmptyState, PromoBannerCarousel, SECTION_SCROLL_MARGIN,
  mobileColumnsClass, useActiveChipInView, useGroupedItems,
} from './layout-parts'

interface CategoryTileProps {
  group: GroupedMenuItems
  isActive: boolean
  onSelect: (categoryId: string) => void
  branding: BrandingColors
  orientation: 'row' | 'rail'
}

/**
 * A kiosk category button: the category's own hero dish on a disc, name set
 * loud underneath. The active tile fills with the brand color.
 */
function CategoryTile({ group, isActive, onSelect, branding, orientation }: CategoryTileProps) {
  const { category, items } = group
  const photo = items.find((item) => item.image_url)?.image_url
  const brand = branding.primary
  const ink = readableOn(brand)
  const isRail = orientation === 'rail'

  return (
    <button
      type="button"
      data-chip-id={category.id}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => onSelect(category.id)}
      className={`group flex shrink-0 flex-col items-center gap-1.5 rounded-[calc(var(--brand-radius,18px)*0.9)] p-2 text-center transition-[background-color,transform] duration-200 active:scale-95 ${isRail ? 'w-full' : 'w-[88px]'}`}
      style={{ backgroundColor: isActive ? brand : 'transparent', color: isActive ? ink : branding.textPrimary }}
    >
      <span
        className={`relative flex items-center justify-center overflow-hidden rounded-full ${isRail ? 'h-16 w-16' : 'h-14 w-14'}`}
        style={{ backgroundColor: isActive ? tint(ink, 18) : tint(brand, 10, branding.cards) }}
      >
        {photo ? (
          <OptimizedImage src={photo} alt="" fill sizes="64px" className="object-cover transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <CategoryIcon icon={category.icon || '🍽️'} color={isActive ? ink : category.icon_color} fallbackColor={brand} size="lg" />
        )}
      </span>
      <span className="line-clamp-2 text-[11px] font-extrabold uppercase leading-tight tracking-[0.02em] md:text-[12px]">
        {category.name}
      </span>
    </button>
  )
}

/**
 * Kiosk — the fast-food ordering screen (Jollibee, McDonald's, Chowking).
 * Big photo tiles choose the category: a swipeable strip on phones, a sticky
 * rail on wider screens. Section heads are set huge and upper-case with a
 * count chip in the accent color, then a dense grid of cards.
 */
export const LayoutKiosk = memo(function LayoutKiosk({
  tenant, categories, filteredItems, allMenuItems, searchQuery, setSearchQuery, setActiveCategory, onItemSelect,
  branding, cardTemplate, heroOverride, bannerOverride, currentSlide, setCurrentSlide, mobileGridColumns,
  menuEngineeringEnabled, hideCurrencySymbol,
}: MenuLayoutContentProps) {
  const groups = useGroupedItems(filteredItems, categories)
  const { activeId, scrollToCategory } = useCategoryScrollSpy(groups.map((group) => group.category.id))
  const stripRef = useActiveChipInView(activeId)
  const chip = branding.accent || branding.secondary
  const gridClassName = `grid ${mobileColumnsClass(mobileGridColumns)} gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4`

  return (
    <div>
      <StorefrontHero
        tenant={tenant}
        branding={branding}
        allMenuItems={allMenuItems}
        onSelectProduct={onItemSelect}
        heroOverride={heroOverride}
        requireExplicit
      />
      <PromoBannerCarousel
        tenant={tenant}
        bannerOverride={bannerOverride}
        currentSlide={currentSlide}
        setCurrentSlide={setCurrentSlide}
        className="mb-6 md:mb-10"
      />
      {branding.searchBar.enabled && (
        <div className="mb-4 md:mb-8 md:max-w-md">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="What are you craving?" branding={branding} />
        </div>
      )}

      {groups.length === 0 ? (
        <LayoutEmptyState
          branding={branding}
          hasFilters={Boolean(searchQuery)}
          onClear={() => { setSearchQuery(''); setActiveCategory(null) }}
        />
      ) : (
        <div className="md:flex md:gap-6 lg:gap-10">
          {/* Phones: a sticky strip of photo tiles. */}
          <nav
            aria-label="Menu categories"
            data-branding-scope="storefront/category-nav"
            className="sticky z-30 -mx-4 mb-6 border-b px-2 md:hidden"
            style={{ top: 'var(--menu-header-h, 0px)', backgroundColor: branding.background, borderColor: branding.border }}
          >
            <div ref={stripRef} className="scrollbar-hide flex gap-1 overflow-x-auto py-2">
              {groups.map((group) => (
                <CategoryTile key={group.category.id} group={group} isActive={activeId === group.category.id} onSelect={scrollToCategory} branding={branding} orientation="row" />
              ))}
            </div>
          </nav>

          {/* Wider screens: a sticky rail. */}
          <nav
            aria-label="Menu categories"
            data-branding-scope="storefront/category-nav"
            className="scrollbar-hide sticky hidden max-h-[calc(100vh-var(--menu-header-h,0px)-2rem)] w-[112px] shrink-0 flex-col gap-1 self-start overflow-y-auto pb-6 md:flex lg:w-[128px]"
            style={{ top: 'calc(var(--menu-header-h, 0px) + 1rem)' }}
          >
            {groups.map((group) => (
              <CategoryTile key={group.category.id} group={group} isActive={activeId === group.category.id} onSelect={scrollToCategory} branding={branding} orientation="rail" />
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-12 md:space-y-16" data-branding-scope="storefront/cards">
            {groups.map(({ category, items }, groupIndex) => (
              <section key={category.id} id={categorySectionId(category.id)} style={SECTION_SCROLL_MARGIN}>
                <header className="mb-4 flex items-center gap-3 md:mb-6">
                  <h2
                    className="min-w-0 text-[1.9rem] font-black uppercase leading-[0.95] tracking-[-0.02em] [text-wrap:balance] md:text-[3.25rem]"
                    style={{ color: branding.menuCategoryHeader }}
                  >
                    {category.name}
                  </h2>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black tabular-nums md:text-[14px]"
                    style={{ backgroundColor: chip, color: readableOn(chip, '#111111') }}
                  >
                    {items.length}
                  </span>
                </header>
                <CategoryItemsGrid
                  items={items}
                  category={category}
                  gridClassName={gridClassName}
                  pageOffset={pageIndexOf(groups, groupIndex, 0)}
                  branding={branding}
                  cardTemplate={cardTemplate}
                  onItemSelect={onItemSelect}
                  menuEngineeringEnabled={menuEngineeringEnabled}
                  hideCurrencySymbol={hideCurrencySymbol}
                />
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
