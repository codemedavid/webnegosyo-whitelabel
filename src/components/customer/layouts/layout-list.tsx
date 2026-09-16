'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'

import { memo, useMemo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { SearchBar } from '../search-bar'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { getContrastColor } from '@/lib/branding-utils'
import { groupMenuItemsByCategory } from '@/lib/menu-grouping'
import { HorizontalScrollSection } from '../horizontal-scroll-section'
import { ResponsiveCategorySection } from '../responsive-category-section'
import { CategoryIcon } from '@/components/shared/category-icon'
import { MenuListRow } from './menu-list-row'

type LayoutListProps = MenuLayoutContentProps

export const LayoutList = memo(function LayoutList({
    tenant,
    categories,
    filteredItems,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    onItemSelect,
    branding,
    cardTemplate = 'classic',
    allMenuItems,
    heroOverride,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    menuEngineeringEnabled,
    hideCurrencySymbol,
}: Omit<LayoutListProps, 'mobileGridColumns' | 'tenantSlug' | 'isLoading'>) {
    const activeColor = branding.menuCategoryActive || branding.primary
    const activeTextColor = getContrastColor(activeColor)
    const inactiveColor = branding.menuCategoryInactive || branding.textSecondary
    // Banners
    const displayBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const showPromotionBanners = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && displayBanners.length > 0

    const groupedItems = useMemo(
        () =>
            groupMenuItemsByCategory({
                items: filteredItems,
                categories,
                uncategorizedCategory: { id: 'uncategorized', name: 'Other', icon: '🍽️' },
            }),
        [filteredItems, categories]
    )

    const formatPrice = (price: number) => hideCurrencySymbol ? price.toFixed(2) : `₱${price.toFixed(2)}`

    return (
        <div className="max-w-2xl mx-auto">
            {/* Minimal Header — shared hero decision (preset wins on any layout) */}
            <StorefrontHero
                tenant={tenant}
                branding={branding}
                allMenuItems={allMenuItems}
                onSelectProduct={onItemSelect}
                heroOverride={heroOverride}
                defaultTitle="Menu"
                defaultDescription="Browse our offerings"
                className="mb-8"
            >
                <div className="mb-8">
                    <div className="inline-flex items-center gap-2">
                        <h1
                            className="text-2xl font-semibold mb-1"
                            style={{ color: heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary }}
                        >
                            {heroOverride?.title || tenant?.hero_title || 'Menu'}
                        </h1>
                    </div>
                    <p
                        className="text-sm"
                        style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
                    >
                        {heroOverride?.description || tenant?.hero_description || 'Browse our offerings'}
                    </p>
                </div>
            </StorefrontHero>

            {/* Search */}
            {branding.searchBar.enabled && (
            <div className="mb-6">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search..."
                    branding={branding}
                />
            </div>
            )}

            {/* Category Navigation Strip */}
            {categories.length > 0 && (
                <div className="mb-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                            style={{
                                backgroundColor: !activeCategory ? activeColor : 'transparent',
                                color: !activeCategory ? activeTextColor : inactiveColor,
                            }}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                                style={{
                                    backgroundColor: activeCategory === cat.id ? activeColor : 'transparent',
                                    color: activeCategory === cat.id ? activeTextColor : inactiveColor,
                                }}
                            >
                                {cat.icon && (
                                    <span className="mr-1">
                                        <CategoryIcon icon={cat.icon} color={cat.icon_color} fallbackColor={activeColor} size="sm" />
                                    </span>
                                )}
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}


            {/* Promotion Banner — compact */}
            {showPromotionBanners && (
                <div className="mb-8 rounded-2xl overflow-hidden relative w-full aspect-[3/1]">
                    {displayBanners.map((banner, index) => (
                        <div
                            key={banner.id}
                            className={`absolute inset-0 transition-opacity duration-500 ${index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            {banner.imageUrl && (
                                <OptimizedImage
                                    src={banner.imageUrl}
                                    alt={banner.title || `Promotion ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 680px"
                                    priority={index === 0}
                                />
                            )}
                        </div>
                    ))}
                    {displayBanners.length > 1 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                            {displayBanners.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlide(index)}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-white/40'}`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* List Content */}
            {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-sm" style={{ color: branding.textSecondary }}>
                        No items found. Try a different search.
                    </p>
                </div>
            ) : (
                <div>
                <div className="space-y-8">
                    {groupedItems.map(({ category, items }) => (
                        <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
                            {/* Category Label */}
                            <div className="mb-3 flex items-center justify-between gap-2 border-b pb-2" style={{ borderColor: branding.border }}>
                                <h2
                                    className="text-[11px] uppercase tracking-[0.15em] font-semibold"
                                    style={{
                                        color: branding.menuCategoryHeader,
                                    }}
                                >
                                    {category.icon && (
                                        <span className="mr-1.5 inline-flex">
                                            <CategoryIcon icon={category.icon} color={category.icon_color} fallbackColor={branding.primary} size="sm" />
                                        </span>
                                    )}
                                    {category.name}
                                </h2>
                            </div>

                            {/* Item Rows or Horizontal Scroll */}
                            <ResponsiveCategorySection
                                displayLayout={category.display_layout}
                                horizontalContent={
                                    <HorizontalScrollSection
                                        items={items}
                                        onItemSelect={onItemSelect}
                                        branding={branding}
                                        template={cardTemplate}
                                        menuEngineeringEnabled={menuEngineeringEnabled}
                                        hideCurrencySymbol={hideCurrencySymbol}
                                    />
                                }
                                gridContent={
                                    <div className="divide-y" style={{ borderColor: `${branding.border}80` }}>
                                        {items.map((item) => (
                                            <MenuListRow
                                                key={item.id}
                                                item={item}
                                                onSelect={onItemSelect}
                                                branding={branding}
                                                formatPrice={formatPrice}
                                                menuEngineeringEnabled={menuEngineeringEnabled}
                                            />
                                        ))}
                                    </div>
                                }
                            />
                        </section>
                    ))}
                </div>
                </div>
            )}
        </div>
    )
})
