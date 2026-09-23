'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'
import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { SearchBar } from '../search-bar'
import { categorySectionId, useCategoryScrollSpy } from '@/hooks/use-category-scroll-spy'
import { pageIndexOf } from '@/lib/above-the-fold'
import { readableOn } from '@/lib/card-color'
import type { BrandingColors } from '@/lib/branding-utils'
import type { GroupedMenuItems } from '@/lib/menu-grouping'
import {
  CategoryChipBar, CategoryItemsGrid, LayoutEmptyState, PromoBannerCarousel, SECTION_SCROLL_MARGIN,
  mobileColumnsClass, useGroupedItems,
} from './layout-parts'

/** Cards in the feature spread: one large dish beside a 2×2 of the next four. */
const SPREAD_SIZE = 5

interface ChapterCoverProps {
  group: GroupedMenuItems
  branding: BrandingColors
  isFlipped: boolean
  isFirst: boolean
}

/**
 * A category's opening spread: its best photo full-bleed with the name set
 * large over a legibility scrim. Without a photo the cover becomes a solid
 * brand-color plate. Covers alternate their text side down the page.
 */
function ChapterCover({ group, branding, isFlipped, isFirst }: ChapterCoverProps) {
  const { category, items } = group
  const cover = items.find((item) => item.image_url)?.image_url
  const plate = branding.primary
  const ink = cover ? '#ffffff' : readableOn(plate)

  return (
    <div
      className="relative mb-5 flex aspect-[4/5] items-end overflow-hidden rounded-[var(--brand-radius,20px)] sm:aspect-[16/9] md:mb-8 lg:aspect-[21/8]"
      style={{ backgroundColor: plate, color: ink }}
    >
      {cover && (
        <>
          <OptimizedImage
            src={cover}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1280px"
            priority={isFirst}
            className="object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03]"
          />
          <div aria-hidden className={`absolute inset-0 ${isFlipped ? 'bg-gradient-to-tl' : 'bg-gradient-to-tr'} from-black/75 via-black/25 to-transparent`} />
        </>
      )}
      <div className={`relative w-full p-6 md:p-12 ${isFlipped ? 'text-right' : 'text-left'}`}>
        <h2 className="text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.035em] [text-wrap:balance] md:text-[5rem]">
          {category.name}
        </h2>
        {category.description && (
          <p className={`mt-3 max-w-[46ch] text-[15px] leading-relaxed md:text-lg ${isFlipped ? 'ml-auto' : ''}`}>
            {category.description}
          </p>
        )}
        <p className="mt-3 text-sm font-medium tabular-nums opacity-90">
          {items.length} {items.length === 1 ? 'dish' : 'dishes'}
        </p>
      </div>
    </div>
  )
}

/**
 * Lookbook — the brand's menu as an editorial book (Aesop, Kinfolk, DTC
 * lookbooks). Each category opens with a photographic cover, then a spread:
 * one hero dish at half width beside a 2×2 of the next four, and the rest
 * four-up. A quiet text index at the top follows the reader down the page.
 */
export const LayoutLookbook = memo(function LayoutLookbook({
  tenant, categories, filteredItems, allMenuItems, searchQuery, setSearchQuery, setActiveCategory, onItemSelect,
  branding, cardTemplate, heroOverride, bannerOverride, currentSlide, setCurrentSlide, mobileGridColumns,
  menuEngineeringEnabled, hideCurrencySymbol,
}: MenuLayoutContentProps) {
  const groups = useGroupedItems(filteredItems, categories)
  const { activeId, scrollToCategory } = useCategoryScrollSpy(groups.map((group) => group.category.id))
  const columns = mobileColumnsClass(mobileGridColumns)
  const search = branding.searchBar.enabled ? (
    <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search the menu" branding={branding} />
  ) : null
  const shared = { branding, cardTemplate, onItemSelect, menuEngineeringEnabled, hideCurrencySymbol }

  return (
    <div>
      <StorefrontHero tenant={tenant} branding={branding} allMenuItems={allMenuItems} onSelectProduct={onItemSelect} heroOverride={heroOverride} requireExplicit />
      <PromoBannerCarousel tenant={tenant} bannerOverride={bannerOverride} currentSlide={currentSlide} setCurrentSlide={setCurrentSlide} className="mb-8 md:mb-12" />
      {search && <div className="mb-4 md:hidden">{search}</div>}

      {groups.length === 0 ? (
        <LayoutEmptyState branding={branding} hasFilters={Boolean(searchQuery)} onClear={() => { setSearchQuery(''); setActiveCategory(null) }} />
      ) : (
        <>
          <CategoryChipBar groups={groups} activeId={activeId} onSelect={scrollToCategory} branding={branding} variant="underline" trailing={search} />
          <div className="space-y-20 md:space-y-32" data-branding-scope="storefront/cards">
            {groups.map((group, groupIndex) => {
              const { category, items } = group
              const pageOffset = pageIndexOf(groups, groupIndex, 0)
              const hasSpread = items.length >= SPREAD_SIZE
              const [lead, ...rest] = items
              const quad = hasSpread ? rest.slice(0, SPREAD_SIZE - 1) : []
              const tail = hasSpread ? rest.slice(SPREAD_SIZE - 1) : items
              return (
                <section key={category.id} id={categorySectionId(category.id)} style={SECTION_SCROLL_MARGIN}>
                  <ChapterCover group={group} branding={branding} isFlipped={groupIndex % 2 === 1} isFirst={groupIndex === 0} />
                  {hasSpread && (
                    <div className="mb-8 grid gap-x-3 gap-y-8 md:mb-12 lg:grid-cols-2 lg:gap-x-8">
                      <CategoryItemsGrid items={[lead]} category={category} gridClassName="grid grid-cols-1" pageOffset={pageOffset} {...shared} />
                      <CategoryItemsGrid items={quad} category={category} gridClassName={`grid ${columns} gap-x-3 gap-y-8 sm:grid-cols-2 md:gap-x-6`} pageOffset={pageOffset + 1} {...shared} />
                    </div>
                  )}
                  {tail.length > 0 && (
                    <CategoryItemsGrid
                      items={tail}
                      category={category}
                      gridClassName={`grid ${columns} gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-12 xl:grid-cols-4`}
                      pageOffset={pageOffset + (hasSpread ? SPREAD_SIZE : 0)}
                      {...shared}
                    />
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
