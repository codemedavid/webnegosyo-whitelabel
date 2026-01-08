'use client'

import { LayoutDefault } from './layout-default'
import { LayoutSidebar } from './layout-sidebar'
import type { MenuItem, Category, Tenant, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import type { PageLayout } from '@/lib/page-layouts'

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
}

import { useEffect } from 'react'

export function MenuLayout({ layout, isLoading, ...props }: MenuLayoutProps) {
    // Reset active category when switching to sidebar layout (to show all items)
    useEffect(() => {
        if (layout === 'sidebar' && props.activeCategory) {
            props.setActiveCategory(null)
        }
    }, [layout, props.activeCategory, props.setActiveCategory])

    switch (layout) {
        case 'sidebar':
            return <LayoutSidebar {...props} />
        case 'default':
        default:
            return <LayoutDefault isLoading={isLoading} {...props} />
    }
}

export { LayoutDefault } from './layout-default'
export { LayoutSidebar } from './layout-sidebar'
