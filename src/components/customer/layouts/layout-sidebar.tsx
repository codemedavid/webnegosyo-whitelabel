'use client'

import Image from 'next/image'
import { MenuGrid } from '../menu-grid'
import { MenuGridGrouped } from '../menu-grid-grouped'
import { SearchBar } from '../search-bar'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface LayoutSidebarProps {
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

import { useEffect, useState, useRef } from 'react'

export function LayoutSidebar({
    tenant,
    categories,
    filteredItems,
    allMenuItems,
    activeCategory: _propActiveCategory, // Ignore prop for highlighting, use local state
    setActiveCategory, // We won't use this to filter, only to clear if needed
    searchQuery,
    setSearchQuery,
    onItemSelect,
    branding,
    cardTemplate,
    heroOverride,
    bannerOverride,
    currentSlide,
    setCurrentSlide,
    mobileGridColumns = 1,
}: LayoutSidebarProps) {
    // Local state for scroll spy
    const [activeSection, setActiveSection] = useState<string | null>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)
    const isClickScrolling = useRef(false)

    // Get banners to display
    const displayBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const showPromotionBanners = (bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible) && displayBanners.length > 0

    // Scroll spy implementation
    useEffect(() => {
        const handleIntersect = (entries: IntersectionObserverEntry[]) => {
            if (isClickScrolling.current) return

            // Find the most visible section
            const visibleSections = entries.filter(entry => entry.isIntersecting)
            if (visibleSections.length > 0) {
                // Sort by intersection ratio to find the most centered one
                const mostVisible = visibleSections.reduce((prev, current) =>
                    prev.intersectionRatio > current.intersectionRatio ? prev : current
                )

                const id = mostVisible.target.id.replace('category-', '')
                setActiveSection(id)
            }
        }

        observerRef.current = new IntersectionObserver(handleIntersect, {
            root: null,
            rootMargin: '-20% 0px -60% 0px', // Highlight when element is in the top-ish part of viewport
            threshold: [0, 0.1, 0.5, 1]
        })

        // Observe all category sections
        categories.forEach(cat => {
            const el = document.getElementById(`category-${cat.id}`)
            if (el) observerRef.current?.observe(el)
        })

        return () => observerRef.current?.disconnect()
    }, [categories, filteredItems]) // Re-run when items change

    const scrollToCategory = (categoryId: string | null) => {
        if (!categoryId) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            setActiveSection(null)
            return
        }

        const el = document.getElementById(`category-${categoryId}`)
        if (el) {
            isClickScrolling.current = true
            // Offset for sticky header + spacing
            const offset = 100
            const elementPosition = el.getBoundingClientRect().top + window.scrollY
            const offsetPosition = elementPosition - offset

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            })

            setActiveSection(categoryId)

            // Re-enable observer after scroll animation (approx 1s)
            setTimeout(() => {
                isClickScrolling.current = false
            }, 1000)
        }
    }

    return (
        <div className="flex gap-4 md:gap-6">
            {/* Sidebar - Visible on all devices now */}
            <aside className="flex flex-col w-20 md:w-24 lg:w-32 shrink-0 sticky top-24 h-[calc(100vh-100px)] overflow-y-auto scrollbar-hide pb-20">
                {/* All Items Button */}
                <button
                    onClick={() => scrollToCategory(null)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all mb-2"
                    style={{
                        backgroundColor: !activeSection ? `${branding.primary}15` : 'transparent',
                        color: !activeSection ? branding.primary : branding.textSecondary,
                    }}
                >
                    <div
                        className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full text-lg md:text-xl transition-transform active:scale-95"
                        style={{ backgroundColor: !activeSection ? branding.primary : `${branding.primary}10` }}
                    >
                        <span style={{ color: !activeSection ? 'white' : branding.primary }}>🍽️</span>
                    </div>
                    <span className="text-[10px] md:text-xs font-medium text-center leading-tight">All</span>
                </button>

                {/* Category Buttons */}
                {categories.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => scrollToCategory(category.id)}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all"
                        style={{
                            backgroundColor: activeSection === category.id ? `${branding.primary}15` : 'transparent',
                            color: activeSection === category.id ? branding.primary : branding.textSecondary,
                        }}
                    >
                        <div
                            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full text-lg md:text-xl transition-transform active:scale-95"
                            style={{
                                backgroundColor: activeSection === category.id ? branding.primary : `${branding.primary}10`
                            }}
                        >
                            <span style={{ color: activeSection === category.id ? 'white' : branding.primary }}>
                                {category.icon || '🍽️'}
                            </span>
                        </div>
                        <span className="text-[10px] md:text-xs font-medium text-center leading-tight line-clamp-2 w-full break-words">
                            {category.name}
                        </span>
                    </button>
                ))}
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
                {/* Search Bar - Sticky on mobile? Optional, but keeping simple for now */}
                <div className="mb-6 sticky top-0 z-30 pt-2 bg-white/80 backdrop-blur-md md:static md:bg-transparent md:pt-0">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search menu..."
                    />
                </div>

                {/* Promotion Banners Carousel */}
                {showPromotionBanners && (
                    <div className="mb-8 rounded-2xl overflow-hidden relative w-full aspect-[21/9] shadow-md">
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
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col justify-end p-4 md:p-6">
                                        {banner.title && (
                                            <h2 className="text-white text-lg md:text-2xl font-bold mb-1 drop-shadow-lg line-clamp-2">
                                                {banner.title}
                                            </h2>
                                        )}
                                        {banner.description && (
                                            <p className="text-white/90 text-xs md:text-base drop-shadow-md line-clamp-2">
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
                                        className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-white/50'}`}
                                        aria-label={`Go to slide ${index + 1}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Removed Mobile Category Tabs as requested */}

                {/* Menu Grid - Always show grouped view in this layout */}
                {filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <div
                            className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4"
                            style={{ backgroundColor: branding.cards }}
                        >
                            <span className="text-2xl">🍽️</span>
                        </div>
                        <h3
                            className="text-lg font-semibold mb-2"
                            style={{ color: branding.textPrimary }}
                        >
                            No items found
                        </h3>
                        <p style={{ color: branding.textSecondary }}>
                            Try adjusting your search
                        </p>
                    </div>
                ) : (
                    <MenuGridGrouped
                        items={filteredItems}
                        categories={categories}
                        template={cardTemplate}
                        onItemSelect={onItemSelect}
                        branding={branding}
                        mobileGridColumns={mobileGridColumns}
                    />
                )}
            </div>
        </div>
    )
}
