'use client'

import { memo, useMemo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { MenuItemCard } from '../menu-item-card'
import { SearchBar } from '../search-bar'
import { Pencil } from 'lucide-react'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { HeroDesign } from '@/types/hero-designer'
import { HeroRenderer } from '@/components/customer/hero-renderer'
import type { BrandingColors } from '@/lib/branding-utils'
import { getContrastColor } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { groupMenuItemsByCategory } from '@/lib/menu-grouping'
import { HorizontalScrollSection } from '../horizontal-scroll-section'
import { ResponsiveCategorySection } from '../responsive-category-section'
import { CategoryIcon } from '@/components/shared/category-icon'

interface LayoutMosaicProps {
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
    onOpenBrandingSection?: (section: 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards') => void
}

export const LayoutMosaic = memo(function LayoutMosaic({
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
    heroOverride,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    menuEngineeringEnabled,
    hideCurrencySymbol,
    isBrandAdmin = false,
    onOpenBrandingSection,
}: Omit<LayoutMosaicProps, 'allMenuItems' | 'tenantSlug' | 'mobileGridColumns' | 'isLoading'>) {
    // Banners
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
                uncategorizedCategory: { id: 'uncategorized', name: 'Discover', icon: '✨' },
            }),
        [filteredItems, categories]
    )

    return (
        <div>
            {/* Header */}
            {tenant?.hero_section_enabled !== false && tenant?.hero_design ? (
                <HeroRenderer design={tenant.hero_design as unknown as HeroDesign} className="mb-10" />
            ) : (
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 justify-center">
                        <h1
                            className="text-3xl md:text-5xl font-bold mb-3"
                            style={{ color: heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary }}
                        >
                            {heroOverride?.title || tenant?.hero_title || 'Our Menu'}
                        </h1>
                        {isBrandAdmin && onOpenBrandingSection && (
                            <button
                                type="button"
                                onClick={() => onOpenBrandingSection('hero')}
                                title="Edit hero section"
                                aria-label="Edit hero section"
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <p
                        className="text-base font-light"
                        style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
                    >
                        {heroOverride?.description || tenant?.hero_description || 'Explore our offerings'}
                    </p>
                </div>
            )}

            {/* Category Pills */}
            {categories.length > 0 && (
                <div className="mb-8 flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className="px-4 py-2 rounded-full text-xs font-medium transition-all"
                            style={{
                                backgroundColor: !activeCategory ? activeColor : `${activeColor}10`,
                                color: !activeCategory ? activeTextColor : inactiveColor,
                            }}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className="px-4 py-2 rounded-full text-xs font-medium transition-all"
                                style={{
                                    backgroundColor: activeCategory === cat.id ? activeColor : `${activeColor}10`,
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
            )}

            {/* Search */}
            <div className="mb-8 max-w-md mx-auto">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Find something..."
                    branding={branding}
                />
            </div>

            {/* Promotion Banners */}
            {showPromotionBanners && (
                <div className="mb-10 rounded-2xl overflow-hidden relative w-full aspect-[21/9] shadow-md">
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
                            {(banner.title || banner.description) && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
                                    {banner.title && (
                                        <h2 className="text-white text-xl md:text-3xl font-bold mb-1">{banner.title}</h2>
                                    )}
                                    {banner.description && (
                                        <p className="text-white/80 text-sm">{banner.description}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {displayBanners.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                            {displayBanners.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlide(index)}
                                    className={`w-2 h-2 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-white/50'}`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Masonry / Mosaic Grid */}
            {filteredItems.length === 0 ? (
                <div className="text-center py-16">
                    <div
                        className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6"
                        style={{ backgroundColor: branding.cards }}
                    >
                        <span className="text-3xl">🍽️</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-2" style={{ color: branding.textPrimary }}>
                        No items found
                    </h3>
                    <p style={{ color: branding.textSecondary }}>
                        Try adjusting your search or category filter
                    </p>
                </div>
            ) : activeCategory ? (
                /* When category is selected — masonry of all items */
                <div
                    className="gap-4"
                    style={{
                        columnCount: 2,
                        columnGap: '1rem',
                    }}
                >
                    {filteredItems.map((item) => (
                        <div key={item.id} className="break-inside-avoid mb-4">
                            <MenuItemCard
                                item={item}
                                onSelect={onItemSelect}
                                branding={branding}
                                template={cardTemplate}
                                menuEngineeringEnabled={menuEngineeringEnabled}
                                hideCurrencySymbol={hideCurrencySymbol}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                /* Grouped masonry with inline section headers */
                <div className="space-y-12">
                    {groupedItems.map(({ category, items }) => (
                        <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
                            {/* Inline Section Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <div
                                    className="flex h-10 w-10 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${branding.primary}15` }}
                                >
                                    <CategoryIcon icon={category.icon || '🍽️'} color={category.icon_color} fallbackColor={branding.primary} size="sm" />
                                </div>
                                <div>
                                    <h2
                                        className="text-lg font-bold"
                                        style={{ color: branding.menuCategoryHeader }}
                                    >
                                        {category.name}
                                    </h2>
                                    <p className="text-xs" style={{ color: branding.textMuted }}>
                                        {items.length} {items.length === 1 ? 'item' : 'items'}
                                    </p>
                                </div>
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
                            {/* Masonry Grid or Horizontal Scroll */}
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
                                    <div
                                        style={{
                                            columnCount: 2,
                                            columnGap: '1rem',
                                        }}
                                        className="md:[column-count:3]"
                                    >
                                        {items.map((item) => (
                                            <div key={item.id} className="break-inside-avoid mb-4">
                                                <MenuItemCard
                                                    item={item}
                                                    onSelect={onItemSelect}
                                                    branding={branding}
                                                    template={cardTemplate}
                                                    menuEngineeringEnabled={menuEngineeringEnabled}
                                                    hideCurrencySymbol={hideCurrencySymbol}
                                                />
                                            </div>
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
