'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'
import { memo, useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { MenuItemCard } from '../menu-item-card'
import { SearchBar } from '../search-bar'
import { categorySectionId, useCategoryScrollSpy } from '@/hooks/use-category-scroll-spy'
import { isAboveTheFold, pageIndexOf } from '@/lib/above-the-fold'
import { resolveCategoryCardTemplate } from '@/lib/category-card-template'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import type { Category, MenuItem } from '@/types/database'
import {
  CategoryChipBar, CategoryItemsGrid, LayoutEmptyState, PromoBannerCarousel, SECTION_SCROLL_MARGIN,
  mobileColumnsClass, useGroupedItems,
} from './layout-parts'

/** Rails need at least this many cards before a "See all" is worth offering. */
const SEE_ALL_THRESHOLD = 3
/** List-style cards (menu board rows) need a wide cell to read as a row. */
const LIST_CARD_WIDTH = 'w-[86%] sm:w-[60%] lg:w-[40%]'
/** Most featured dishes shown in the opening rail. */
const FEATURED_LIMIT = 10

interface RailProps {
  items: MenuItem[]
  category: Category | null
  cardTemplate: CardTemplate
  branding: BrandingColors
  onItemSelect: (item: MenuItem) => void
  pageOffset: number
  cardWidthClassName: string
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  label: string
}

/** One swipeable row of cards, with arrow buttons on pointer devices. */
function Rail({
  items, category, cardTemplate, branding, onItemSelect, pageOffset, cardWidthClassName,
  menuEngineeringEnabled, hideCurrencySymbol, label,
}: RailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const template = resolveCategoryCardTemplate(category, cardTemplate)
  const scrollBy = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }, [])
  const arrowStyle = { backgroundColor: branding.cards, color: branding.textPrimary, borderColor: branding.border }

  return (
    <div className="group/rail relative">
      <div
        ref={scrollerRef}
        role="region"
        aria-label={label}
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:gap-5"
      >
        {items.map((item, index) => (
          <div key={item.id} className={`shrink-0 snap-start ${template === 'menuboard' ? LIST_CARD_WIDTH : cardWidthClassName}`}>
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
      {items.length > 2 && (
        <>
          <button type="button" aria-label={`Scroll ${label} back`} onClick={() => scrollBy(-1)} className="absolute left-1 top-[38%] z-20 hidden h-10 w-10 items-center justify-center rounded-full border opacity-0 shadow-[0_6px_16px_rgba(0,0,0,0.14)] transition-opacity duration-200 group-hover/rail:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex" style={arrowStyle}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label={`Scroll ${label} forward`} onClick={() => scrollBy(1)} className="absolute right-1 top-[38%] z-20 hidden h-10 w-10 items-center justify-center rounded-full border opacity-0 shadow-[0_6px_16px_rgba(0,0,0,0.14)] transition-opacity duration-200 group-hover/rail:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex" style={arrowStyle}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  )
}

/**
 * Rails — the café app home (Starbucks, Tim Hortons, Blue Bottle apps).
 * A wide featured rail opens the page, then every category is one swipeable
 * row. "See all" unrolls a row into a full grid in place, so a long menu stays
 * scannable at a glance without hiding anything.
 */
export const LayoutRails = memo(function LayoutRails({
  tenant, categories, filteredItems, allMenuItems, searchQuery, setSearchQuery, setActiveCategory, onItemSelect,
  branding, cardTemplate, heroOverride, bannerOverride, currentSlide, setCurrentSlide, mobileGridColumns,
  menuEngineeringEnabled, hideCurrencySymbol,
}: MenuLayoutContentProps) {
  const groups = useGroupedItems(filteredItems, categories)
  const { activeId, scrollToCategory } = useCategoryScrollSpy(groups.map((group) => group.category.id))
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const isSearching = Boolean(searchQuery.trim())
  const featured = isSearching ? [] : filteredItems.filter((item) => item.is_featured).slice(0, FEATURED_LIMIT)
  const railOffset = featured.length
  const gridClassName = `grid ${mobileColumnsClass(mobileGridColumns)} gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4`

  const toggle = (categoryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  return (
    <div>
      <StorefrontHero
        tenant={tenant}
        branding={branding}
        allMenuItems={allMenuItems}
        onSelectProduct={onItemSelect}
        heroOverride={heroOverride}
        defaultTitle="Our Menu"
      />
      <PromoBannerCarousel tenant={tenant} bannerOverride={bannerOverride} currentSlide={currentSlide} setCurrentSlide={setCurrentSlide} className="mb-8 md:mb-12" />
      {branding.searchBar.enabled && (
        <div className="mb-4 md:mb-6 md:max-w-md">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search the menu" branding={branding} />
        </div>
      )}

      {groups.length === 0 ? (
        <LayoutEmptyState branding={branding} hasFilters={isSearching} onClear={() => { setSearchQuery(''); setActiveCategory(null) }} />
      ) : (
        <>
          <CategoryChipBar groups={groups} activeId={activeId} onSelect={scrollToCategory} branding={branding} variant="pill" />
          <div className="space-y-12 md:space-y-16" data-branding-scope="storefront/cards">
            {featured.length > 0 && (
              <section aria-labelledby="rails-featured">
                <h2 id="rails-featured" className="mb-4 text-2xl font-bold tracking-[-0.02em] md:mb-6 md:text-3xl" style={{ color: branding.menuCategoryHeader }}>
                  Featured
                </h2>
                <Rail items={featured} category={null} cardTemplate={cardTemplate} branding={branding} onItemSelect={onItemSelect} pageOffset={0} cardWidthClassName="w-[78%] sm:w-[46%] lg:w-[31%]" menuEngineeringEnabled={menuEngineeringEnabled} hideCurrencySymbol={hideCurrencySymbol} label="Featured" />
              </section>
            )}

            {groups.map(({ category, items }, groupIndex) => {
              const isExpanded = isSearching || expanded.has(category.id)
              const pageOffset = railOffset + pageIndexOf(groups, groupIndex, 0)
              return (
                <section key={category.id} id={categorySectionId(category.id)} style={SECTION_SCROLL_MARGIN}>
                  <header className="mb-4 flex items-baseline justify-between gap-4 md:mb-5">
                    <h2 className="min-w-0 text-xl font-bold leading-tight tracking-[-0.015em] md:text-2xl" style={{ color: branding.menuCategoryHeader }}>
                      {category.name}
                    </h2>
                    {!isSearching && items.length >= SEE_ALL_THRESHOLD && (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggle(category.id)}
                        className="shrink-0 text-sm font-semibold underline-offset-4 hover:underline"
                        style={{ color: branding.link || branding.primary }}
                      >
                        {isExpanded ? 'Show less' : `See all ${items.length}`}
                      </button>
                    )}
                  </header>
                  {isExpanded ? (
                    <CategoryItemsGrid items={items} category={category} gridClassName={gridClassName} pageOffset={pageOffset} branding={branding} cardTemplate={cardTemplate} onItemSelect={onItemSelect} menuEngineeringEnabled={menuEngineeringEnabled} hideCurrencySymbol={hideCurrencySymbol} />
                  ) : (
                    <Rail items={items} category={category} cardTemplate={cardTemplate} branding={branding} onItemSelect={onItemSelect} pageOffset={pageOffset} cardWidthClassName="w-[46%] sm:w-[31%] lg:w-[23%]" menuEngineeringEnabled={menuEngineeringEnabled} hideCurrencySymbol={hideCurrencySymbol} label={category.name} />
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
})
