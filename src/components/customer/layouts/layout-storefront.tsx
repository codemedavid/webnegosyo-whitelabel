'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'
import { memo } from 'react'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { SearchBar } from '../search-bar'
import { categorySectionId, useCategoryScrollSpy } from '@/hooks/use-category-scroll-spy'
import { pageIndexOf } from '@/lib/above-the-fold'
import {
  CategoryChipBar, CategoryItemsGrid, LayoutEmptyState, PromoBannerCarousel, SECTION_SCROLL_MARGIN,
  mobileColumnsClass, useGroupedItems,
} from './layout-parts'

/**
 * Storefront — a Shopify collection page for a menu.
 * One long page, every category in order under a large title with its count,
 * up to four products a row on desktop. A sticky chip bar follows the scroll
 * and jumps between categories; on wide screens the search sits at its end.
 */
export const LayoutStorefront = memo(function LayoutStorefront({
  tenant, categories, filteredItems, allMenuItems, searchQuery, setSearchQuery, setActiveCategory, onItemSelect,
  branding, cardTemplate, heroOverride, bannerOverride, currentSlide, setCurrentSlide, mobileGridColumns,
  menuEngineeringEnabled, hideCurrencySymbol,
}: MenuLayoutContentProps) {
  const groups = useGroupedItems(filteredItems, categories)
  const { activeId, scrollToCategory } = useCategoryScrollSpy(groups.map((group) => group.category.id))
  const search = branding.searchBar.enabled ? (
    <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search the menu" branding={branding} />
  ) : null
  const gridClassName = `grid ${mobileColumnsClass(mobileGridColumns)} gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-12 xl:grid-cols-4`

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
        className="mb-8 md:mb-12"
      />

      {search && <div className="mb-4 md:hidden">{search}</div>}

      {groups.length > 0 && (
        <CategoryChipBar
          groups={groups}
          activeId={activeId}
          onSelect={scrollToCategory}
          branding={branding}
          variant="pill"
          trailing={search}
        />
      )}

      {groups.length === 0 ? (
        <LayoutEmptyState
          branding={branding}
          hasFilters={Boolean(searchQuery)}
          onClear={() => { setSearchQuery(''); setActiveCategory(null) }}
        />
      ) : (
        <div id="storefront-menu" className="space-y-16 md:space-y-24" data-branding-scope="storefront/cards">
          {groups.map(({ category, items }, groupIndex) => (
            <section key={category.id} id={categorySectionId(category.id)} style={SECTION_SCROLL_MARGIN}>
              <header className="mb-5 flex items-end justify-between gap-4 md:mb-8">
                <div className="min-w-0">
                  <h2
                    className="text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.025em] [text-wrap:balance] md:text-[2.75rem]"
                    style={{ color: branding.menuCategoryHeader }}
                  >
                    {category.name}
                  </h2>
                  {category.description && (
                    <p className="mt-2 max-w-[60ch] text-sm leading-relaxed md:text-base" style={{ color: branding.textSecondary }}>
                      {category.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 pb-1 text-sm tabular-nums" style={{ color: branding.textMuted }}>
                  {items.length} {items.length === 1 ? 'item' : 'items'}
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
      )}
    </div>
  )
})
