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

interface LayoutMagazineProps {
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
    onOpenBrandingSection?: (section: 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards' | 'search_bar') => void
}

export const LayoutMagazine = memo(function LayoutMagazine({
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
}: Omit<LayoutMagazineProps, 'allMenuItems' | 'mobileGridColumns' | 'tenantSlug'>) {
    const activeColor = branding.menuCategoryActive || branding.primary
    const activeTextColor = getContrastColor(activeColor)
    const inactiveColor = branding.menuCategoryInactive || branding.textSecondary
    // Get banners to display
    const displayBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const showPromotionBanners = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && displayBanners.length > 0

    // Find a featured/star item for the hero
    const featuredItem = useMemo(
        () => filteredItems.find(item => item.is_featured || item.bcg_classification === 'star'),
        [filteredItems]
    )
    const remainingItems = useMemo(
        () => filteredItems.filter(item => item.id !== featuredItem?.id),
        [filteredItems, featuredItem?.id]
    )

    const groupedItems = useMemo(
        () =>
            groupMenuItemsByCategory({
                items: remainingItems,
                categories,
                uncategorizedCategory: { id: 'uncategorized', name: 'More Items', icon: '🍽️' },
            }),
        [remainingItems, categories]
    )

    const formatPrice = (price: number) => hideCurrencySymbol ? price.toFixed(2) : `₱${price.toFixed(2)}`

    return (
        <div className="max-w-5xl mx-auto">
            {/* Editorial Header */}
            {tenant?.hero_section_enabled !== false && tenant?.hero_design && (tenant.hero_design as Record<string, unknown>).version !== 4 ? (
                <HeroRenderer design={tenant.hero_design as unknown as HeroDesign} className={
                    (tenant.hero_design as unknown as HeroDesign).layoutMode === 'fullscreen' ? 'mb-6' : 'mb-16'
                } />
            ) : (
                <div className="mb-16 text-center">
                    <p
                        className="text-xs uppercase tracking-[0.3em] mb-4 font-medium"
                        style={{ color: branding.primary }}
                    >
                        {tenant?.name || 'Menu'}
                    </p>
                    <div className="inline-flex items-center gap-2 justify-center">
                        <h1
                            className="text-5xl md:text-7xl font-serif font-bold mb-6 leading-[1.1]"
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
                    <div
                        className="w-16 h-[2px] mx-auto mb-6"
                        style={{ backgroundColor: branding.primary }}
                    />
                    <p
                        className="text-lg font-light max-w-md mx-auto"
                        style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
                    >
                        {heroOverride?.description || tenant?.hero_description || 'Handcrafted with care'}
                    </p>
                </div>
            )}

            {/* Promotion Banners */}
            {showPromotionBanners && (
                <div className="mb-16 rounded-3xl overflow-hidden relative w-full aspect-[21/9] shadow-lg">
                    {displayBanners.map((banner, index) => (
                        <div
                            key={banner.id}
                            className={`absolute inset-0 transition-opacity duration-700 ${index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            {banner.imageUrl && (
                                <OptimizedImage
                                    src={banner.imageUrl}
                                    alt={banner.title || `Promotion ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 1000px"
                                    priority={index === 0}
                                />
                            )}
                            {(banner.title || banner.description) && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-8">
                                    {banner.title && (
                                        <h2 className="text-white text-2xl md:text-3xl font-serif font-bold mb-1">{banner.title}</h2>
                                    )}
                                    {banner.description && (
                                        <p className="text-white/80 text-sm md:text-base">{banner.description}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {displayBanners.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                            {displayBanners.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlide(index)}
                                    className={`w-2 h-2 rounded-full transition-all ${index === currentSlide ? 'bg-white w-6' : 'bg-white/50'}`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Search */}
            {(branding.searchBar.enabled || isBrandAdmin) && (
            <div className="mb-8 max-w-md mx-auto">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search the menu..."
                    branding={branding}
                    isBrandAdmin={isBrandAdmin}
                    onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}
                />
            </div>
            )}

            {/* Category Navigation */}
            {categories.length > 0 && (
                <div className="mb-12 flex items-center justify-center gap-3">
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

            {/* Featured Hero Item */}
            {featuredItem && (
                <button
                    onClick={() => onItemSelect(featuredItem)}
                    className="w-full mb-16 group rounded-3xl overflow-hidden relative aspect-[16/7] block shadow-xl transition-shadow hover:shadow-2xl"
                    style={{ backgroundColor: branding.cards }}
                >
                    {featuredItem.image_url ? (
                        <OptimizedImage
                            src={featuredItem.image_url}
                            alt={featuredItem.name}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, 1000px"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-20">🍽️</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
                        <span
                            className="inline-block text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full mb-3 font-medium"
                            style={{ backgroundColor: branding.primary, color: '#fff' }}
                        >
                            Featured
                        </span>
                        <h2 className="text-white text-2xl md:text-4xl font-serif font-bold mb-2">
                            {featuredItem.name}
                        </h2>
                        {featuredItem.description && (
                            <p className="text-white/75 text-sm md:text-base max-w-lg line-clamp-2 mb-3">
                                {featuredItem.description}
                            </p>
                        )}
                        <span className="text-white text-xl md:text-2xl font-bold">
                            {formatPrice(featuredItem.discounted_price && featuredItem.discounted_price < featuredItem.price
                                ? featuredItem.discounted_price
                                : featuredItem.price
                            )}
                        </span>
                    </div>
                </button>
            )}

            {/* Grouped Items — 2-column grid */}
            {isBrandAdmin && onOpenBrandingSection && filteredItems.length > 0 && (
                <div className="flex justify-end mb-3">
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
                        Try adjusting your search
                    </p>
                </div>
            ) : (
                <div className="space-y-16">
                    {groupedItems.map(({ category, items }) => (
                        <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
                            {/* Category Divider */}
                            <div className="mb-8 space-y-3">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="h-[1px] flex-1"
                                        style={{ backgroundColor: branding.border }}
                                    />
                                    <h2
                                        className="text-sm uppercase tracking-[0.2em] font-semibold whitespace-nowrap"
                                        style={{ color: branding.menuCategoryHeader }}
                                    >
                                        {category.icon && (
                                            <span className="mr-2 inline-flex">
                                                <CategoryIcon icon={category.icon} color={category.icon_color} fallbackColor={branding.primary} size="sm" />
                                            </span>
                                        )}
                                        {category.name}
                                    </h2>
                                    <div
                                        className="h-[1px] flex-1"
                                        style={{ backgroundColor: branding.border }}
                                    />
                                </div>
                                {isBrandAdmin && onOpenBrandingSection && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => onOpenBrandingSection('category_header')}
                                            title="Edit category header colors"
                                            aria-label="Edit category header colors"
                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 2-column Grid or Horizontal Scroll */}
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
