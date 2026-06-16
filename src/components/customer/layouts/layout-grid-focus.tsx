'use client'

import { memo, useMemo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { MenuItemCard } from '../menu-item-card'
import { SearchBar } from '../search-bar'
import { Pencil } from 'lucide-react'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { getContrastColor } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { groupMenuItemsByCategory } from '@/lib/menu-grouping'
import { HorizontalScrollSection } from '../horizontal-scroll-section'
import { ResponsiveCategorySection } from '../responsive-category-section'
import { CategoryIcon } from '@/components/shared/category-icon'

interface LayoutGridFocusProps {
    tenant: Tenant | null
    tenantSlug: string
    categories: Category[]
    filteredItems: MenuItem[]
    allMenuItems: MenuItem[]
    activeCategory: string | null
    setActiveCategory: (id: string | null) => void
    searchQuery: string
    setSearchQuery: (query: string) => void
    onItemSelect: (item: MenuItem) => void
    branding: BrandingColors
    cardTemplate: CardTemplate
    isLoading: boolean
    heroOverride?: {
        title?: string
        description?: string
        heroTitleColor?: string
        heroDescriptionColor?: string
    } | null
    bannerOverride?: {
        promotionBanners?: PromotionBanner[]
        isPromotionVisible?: boolean
    } | null
    currentSlide: number
    setCurrentSlide: (slide: number) => void
    mobileGridColumns?: number
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
    isBrandAdmin?: boolean
    onOpenBrandingSection?: (section: 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards' | 'search_bar') => void
}

export const LayoutGridFocus = memo(function LayoutGridFocus({
    tenant,
    categories,
    filteredItems,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    onItemSelect,
    branding,
    cardTemplate,
    isLoading,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    menuEngineeringEnabled,
    hideCurrencySymbol,
    isBrandAdmin = false,
    onOpenBrandingSection,
}: Omit<LayoutGridFocusProps, 'allMenuItems' | 'heroOverride' | 'tenantSlug' | 'mobileGridColumns'>) {
    // Get banners
    const displayBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const showPromotionBanners = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && displayBanners.length > 0
    const activeColor = branding.menuCategoryActive || branding.primary
    const activeTextColor = getContrastColor(activeColor)
    const inactiveColor = branding.menuCategoryInactive || branding.textSecondary
    const groupedItems = useMemo(
        () =>
            groupMenuItemsByCategory({
                items: filteredItems,
                categories,
            }),
        [filteredItems, categories]
    )

    return (
        <div>
            {/* Compact Search Bar */}
            {!isLoading && (branding.searchBar.enabled || isBrandAdmin) && (
                <div className="mb-4">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search menu..."
                        branding={branding}
                        isBrandAdmin={isBrandAdmin}
                        onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}
                    />
                </div>
            )}

            {/* Slim Category Strip */}
            {!isLoading && categories.length > 0 && (
                <div
                    className="sticky z-40 mb-4 py-2 px-1 rounded-xl backdrop-blur-sm border-b"
                    style={{
                        top: 'var(--menu-header-h, 5rem)',
                        backgroundColor: `${branding.header}ee`,
                        borderColor: branding.border
                    }}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
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
                        {isBrandAdmin && onOpenBrandingSection && (
                            <button
                                type="button"
                                onClick={() => onOpenBrandingSection('category_navigation')}
                                title="Edit category navigation colors"
                                aria-label="Edit category navigation colors"
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Promotion Banner — slim */}
            {showPromotionBanners && (
                <div className="mb-4 rounded-xl overflow-hidden relative w-full aspect-[3/1] shadow-sm">
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
                                    sizes="(max-width: 768px) 100vw, 1200px"
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
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-white/50'}`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Dense Grid — 3 columns desktop, 2 mobile */}
            {filteredItems.length === 0 && !isLoading ? (
                <div className="text-center py-16">
                    <div
                        className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ backgroundColor: branding.cards }}
                    >
                        <span className="text-2xl">🍽️</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: branding.textPrimary }}>
                        No items found
                    </h3>
                    <p className="text-sm" style={{ color: branding.textSecondary }}>
                        Try a different search or category
                    </p>
                </div>
            ) : activeCategory ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                        <MenuItemCard
                            key={item.id}
                            item={item}
                            onSelect={onItemSelect}
                            branding={branding}
                            template={cardTemplate}
                            menuEngineeringEnabled={menuEngineeringEnabled}
                            hideCurrencySymbol={hideCurrencySymbol}
                        />
                    ))}
                </div>
            ) : (
                <div className="space-y-8">
                    {groupedItems.map(({ category, items }) => (
                        <section key={category.id} id={`category-${category.id}`} className="scroll-mt-28">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h2
                                    className="text-xs uppercase tracking-[0.15em] font-semibold flex items-center gap-2"
                                    style={{ color: branding.menuCategoryHeader }}
                                >
                                    {category.icon && <CategoryIcon icon={category.icon} color={category.icon_color} fallbackColor={branding.primary} size="sm" />}
                                    {category.name}
                                    <span className="text-[10px] font-normal">({items.length})</span>
                                </h2>
                                {isBrandAdmin && onOpenBrandingSection && (
                                    <button
                                        type="button"
                                        onClick={() => onOpenBrandingSection('category_header')}
                                        title="Edit category header colors"
                                        aria-label="Edit category header colors"
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            {isBrandAdmin && onOpenBrandingSection && (
                                <div className="flex justify-end mb-2">
                                    <button
                                        type="button"
                                        onClick={() => onOpenBrandingSection('menu_cards')}
                                        title="Edit card colors"
                                        aria-label="Edit card colors"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
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
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {items.map((item) => (
                                            <MenuItemCard
                                                key={item.id}
                                                item={item}
                                                onSelect={onItemSelect}
                                                branding={branding}
                                                template={cardTemplate}
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
            )}
        </div>
    )
})
