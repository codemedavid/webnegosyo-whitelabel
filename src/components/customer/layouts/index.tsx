'use client'

import { LayoutDefault } from './layout-default'
import { LayoutSidebar } from './layout-sidebar'
import { LayoutMagazine } from './layout-magazine'
import { LayoutGridFocus } from './layout-grid-focus'
import { LayoutList } from './layout-list'
import { LayoutMosaic } from './layout-mosaic'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import type { PageLayout } from '@/lib/page-layouts'

type MenuBrandingSection = 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge'

interface MenuLayoutProps {
    layout: PageLayout
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
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
    isBrandAdmin?: boolean
    onOpenBrandingSection?: (section: MenuBrandingSection) => void
}

import { useEffect } from 'react'

export function MenuLayout({ layout, isLoading, ...props }: MenuLayoutProps) {
    const { activeCategory, setActiveCategory } = props
    // Reset active category when switching to sidebar layout (to show all items)
    useEffect(() => {
        if (layout === 'sidebar' && activeCategory) {
            setActiveCategory(null)
        }
    }, [layout, activeCategory, setActiveCategory])

    switch (layout) {
        case 'sidebar':
            return <LayoutSidebar {...props} />
        case 'magazine':
            return <LayoutMagazine {...props} />
        case 'grid-focus':
            return <LayoutGridFocus isLoading={isLoading} {...props} />
        case 'list':
            return <LayoutList {...props} />
        case 'mosaic':
            return <LayoutMosaic {...props} />
        case 'default':
        default:
            return <LayoutDefault isLoading={isLoading} {...props} />
    }
}

export { LayoutDefault } from './layout-default'
export { LayoutSidebar } from './layout-sidebar'
export { LayoutMagazine } from './layout-magazine'
export { LayoutGridFocus } from './layout-grid-focus'
export { LayoutList } from './layout-list'
export { LayoutMosaic } from './layout-mosaic'
