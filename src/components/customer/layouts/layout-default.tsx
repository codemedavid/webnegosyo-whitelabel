'use client'

import Image from 'next/image'
import { MenuGrid } from '../menu-grid'
import { MenuGridGrouped } from '../menu-grid-grouped'
import { SearchBar } from '../search-bar'
import { CategoryTabs } from '../category-tabs'
import { CategorySubmenu } from '../category-submenu'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface LayoutDefaultProps {
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
    // Hero overrides
    heroOverride?: {
        title?: string
        description?: string
        heroTitleColor?: string
        heroDescriptionColor?: string
    } | null
    // Banner overrides
    bannerOverride?: {
        promotionBanners?: PromotionBanner[]
        isPromotionVisible?: boolean
    } | null
    currentSlide: number
    setCurrentSlide: (slide: number) => void
    mobileGridColumns?: number
}

export function LayoutDefault({
    tenant,
    categories,
    filteredItems,
    allMenuItems,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    onItemSelect,
    branding,
    cardTemplate,
    isLoading,
    heroOverride,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    mobileGridColumns = 1,
}: LayoutDefaultProps) {
    // Get banners to display
    const displayBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const showPromotionBanners = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && displayBanners.length > 0

    return (
        <div>
            {/* Hero Section */}
            <div className="text-center mb-16">
                <h1
                    className="text-5xl font-serif font-bold mb-4"
                    style={{ color: heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary }}
                >
                    {heroOverride?.title || tenant?.hero_title || 'Our Menu'}
                </h1>
                <p
                    className="text-lg font-light"
                    style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
                >
                    {heroOverride?.description || tenant?.hero_description || 'Your Smart Ordering Partner'}
                </p>
            </div>

            {/* Promotion Banners Carousel */}
            {showPromotionBanners && (
                <div className="mb-12 rounded-2xl overflow-hidden relative w-full aspect-[21/9] shadow-md">
                    {displayBanners.map((banner, index) => (
                        <div
                            key={banner.id}
                            className={`absolute inset-0 transition-opacity duration-500 ${index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                }`}
                        >
                            {banner.imageUrl && (
                                <Image
                                    src={banner.imageUrl}
                                    alt={banner.title || `Promotion ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                                    priority={index === 0}
                                />
                            )}
                            {(banner.title || banner.description) && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col justify-end p-6 md:p-10">
                                    {banner.title && (
                                        <h2 className="text-white text-2xl md:text-4xl font-bold mb-2 drop-shadow-lg">
                                            {banner.title}
                                        </h2>
                                    )}
                                    {banner.description && (
                                        <p className="text-white/90 text-base md:text-lg max-w-2xl drop-shadow-md">
                                            {banner.description}
                                        </p>
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
                                    className={`w-2.5 h-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 ${index === currentSlide ? 'bg-white' : 'bg-white/50 hover:bg-white/75'
                                        }`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Mobile Search */}
            {!isLoading && (
                <div className="mb-8 md:hidden">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search for dishes..."
                    />
                </div>
            )}

            {/* Mobile Category Navigation - Sticky */}
            {!isLoading && categories.length > 0 && (
                <div
                    className="sticky top-20 z-40 backdrop-blur-sm border-b mb-8 md:hidden rounded-[20px]"
                    style={{
                        backgroundColor: branding.header,
                        borderColor: branding.border
                    }}
                >
                    <div className="px-4 py-3">
                        <CategoryTabs
                            categories={categories}
                            activeCategory={activeCategory}
                            onCategoryChange={setActiveCategory}
                            branding={branding}
                        />
                    </div>
                </div>
            )}

            {filteredItems.length === 0 && !isLoading ? (
                <div className="text-center py-16">
                    <div
                        className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6"
                        style={{ backgroundColor: branding.cards }}
                    >
                        <span className="text-3xl">🍽️</span>
                    </div>
                    <h3
                        className="text-xl font-semibold mb-2"
                        style={{ color: branding.textPrimary }}
                    >
                        No items found
                    </h3>
                    <p
                        className="mb-6"
                        style={{ color: branding.textSecondary }}
                    >
                        {searchQuery || activeCategory
                            ? "Try adjusting your search or category filter"
                            : "This restaurant doesn't have any menu items yet"
                        }
                    </p>
                    {(searchQuery || activeCategory) && (
                        <button
                            onClick={() => {
                                setSearchQuery('')
                                setActiveCategory(null)
                            }}
                            className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
                            style={{
                                backgroundColor: branding.buttonPrimary,
                                color: branding.buttonPrimaryText
                            }}
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            ) : (
                // Show grouped view when no category is selected, regular grid when category is selected
                activeCategory ? (
                    <MenuGrid
                        items={filteredItems}
                        template={cardTemplate}
                        onItemSelect={onItemSelect}
                        branding={branding}
                        mobileGridColumns={mobileGridColumns}
                    />
                ) : (
                    <MenuGridGrouped
                        items={filteredItems}
                        categories={categories}
                        template={cardTemplate}
                        onItemSelect={onItemSelect}
                        branding={branding}
                        mobileGridColumns={mobileGridColumns}
                    />
                )
            )}
        </div>
    )
}
