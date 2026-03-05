'use client'

import { memo, useMemo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
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

interface LayoutListProps {
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
    heroOverride,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    menuEngineeringEnabled,
    hideCurrencySymbol,
    isBrandAdmin = false,
    onOpenBrandingSection,
}: Omit<LayoutListProps, 'allMenuItems' | 'mobileGridColumns' | 'tenantSlug' | 'isLoading'>) {
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
            {/* Minimal Header */}
            <div className="mb-8">
                <div className="inline-flex items-center gap-2">
                    <h1
                        className="text-2xl font-semibold mb-1"
                        style={{ color: heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary }}
                    >
                        {heroOverride?.title || tenant?.hero_title || 'Menu'}
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
                    className="text-sm"
                    style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
                >
                    {heroOverride?.description || tenant?.hero_description || 'Browse our offerings'}
                </p>
            </div>

            {/* Search */}
            <div className="mb-6">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search..."
                    branding={branding}
                />
            </div>

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
                    {isBrandAdmin && onOpenBrandingSection && (
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
                                        {items.map((item) => {
                                            const hasDiscount = item.discounted_price && item.discounted_price < item.price
                                            const displayPrice = hasDiscount ? item.discounted_price! : item.price
                                            const isStar = menuEngineeringEnabled && item.bcg_classification === 'star'

                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => onItemSelect(item)}
                                                    className="flex items-center gap-4 py-3 w-full text-left group transition-colors hover:bg-black/[0.02] rounded-lg px-2 -mx-2"
                                                >
                                                    {/* Thumbnail */}
                                                    <div
                                                        className="relative h-14 w-14 md:h-16 md:w-16 rounded-xl overflow-hidden shrink-0"
                                                        style={{ backgroundColor: branding.cards }}
                                                    >
                                                        {item.image_url ? (
                                                            <OptimizedImage
                                                                src={item.image_url}
                                                                alt={item.name}
                                                                fill
                                                                className="object-cover"
                                                                sizes="64px"
                                                            />
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full text-lg opacity-30">
                                                                🍽️
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h3
                                                                className="text-sm font-medium truncate"
                                                                style={{ color: branding.cardTitle }}
                                                            >
                                                                {item.name}
                                                            </h3>
                                                            {isStar && (
                                                                <span className="text-xs">⭐</span>
                                                            )}
                                                            {item.is_featured && (
                                                                <span
                                                                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
                                                                    style={{ backgroundColor: `${branding.primary}15`, color: branding.primary }}
                                                                >
                                                                    Featured
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.description && (
                                                            <p
                                                                className="text-xs mt-0.5 line-clamp-1"
                                                                style={{ color: branding.cardDescription }}
                                                            >
                                                                {item.description}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Price + Add */}
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <div className="text-right">
                                                            <span
                                                                className="text-sm font-semibold"
                                                                style={{ color: branding.cardPrice }}
                                                            >
                                                                {formatPrice(displayPrice)}
                                                            </span>
                                                            {hasDiscount && (
                                                                <span
                                                                    className="text-[10px] line-through block"
                                                                    style={{ color: branding.textMuted }}
                                                                >
                                                                    {formatPrice(item.price)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div
                                                            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-transform group-hover:scale-110"
                                                            style={{ backgroundColor: branding.primary, color: '#fff' }}
                                                        >
                                                            +
                                                        </div>
                                                    </div>
                                                </button>
                                            )
                                        })}
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
