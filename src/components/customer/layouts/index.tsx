'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'

import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'
import { DEFAULT_PAGE_LAYOUT, PAGE_LAYOUT_IDS, type PageLayout } from '@/lib/page-layouts'
import { pickDesignId } from '@/lib/design-ids'

type MenuLayoutProps = MenuLayoutContentProps & { layout: PageLayout }

// Minimal skeleton shown while the layout chunk loads on first render.
function LayoutSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-12 w-48 rounded-lg bg-gray-100 mx-auto" />
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl bg-gray-100" style={{ minHeight: 200 }} />
                ))}
            </div>
        </div>
    )
}

// Each layout is loaded lazily — only the active tenant's layout chunk is fetched.
const LayoutDefault = dynamic<MenuLayoutContentProps>(
    () => import('./layout-default').then((m) => ({ default: m.LayoutDefault })),
    { loading: LayoutSkeleton }
)
const LayoutSidebar = dynamic<MenuLayoutContentProps>(
    () => import('./layout-sidebar').then((m) => ({ default: m.LayoutSidebar })),
    { loading: LayoutSkeleton }
)
const LayoutMagazine = dynamic<MenuLayoutContentProps>(
    () => import('./layout-magazine').then((m) => ({ default: m.LayoutMagazine })),
    { loading: LayoutSkeleton }
)
const LayoutGridFocus = dynamic<MenuLayoutContentProps>(
    () => import('./layout-grid-focus').then((m) => ({ default: m.LayoutGridFocus })),
    { loading: LayoutSkeleton }
)
const LayoutList = dynamic<MenuLayoutContentProps>(
    () => import('./layout-list').then((m) => ({ default: m.LayoutList })),
    { loading: LayoutSkeleton }
)
const LayoutMosaic = dynamic<MenuLayoutContentProps>(
    () => import('./layout-mosaic').then((m) => ({ default: m.LayoutMosaic })),
    { loading: LayoutSkeleton }
)

const LayoutStorefront = dynamic<MenuLayoutContentProps>(
    () => import('./layout-storefront').then((m) => ({ default: m.LayoutStorefront })),
    { loading: LayoutSkeleton }
)
const LayoutKiosk = dynamic<MenuLayoutContentProps>(
    () => import('./layout-kiosk').then((m) => ({ default: m.LayoutKiosk })),
    { loading: LayoutSkeleton }
)
const LayoutRails = dynamic<MenuLayoutContentProps>(
    () => import('./layout-rails').then((m) => ({ default: m.LayoutRails })),
    { loading: LayoutSkeleton }
)
const LayoutLookbook = dynamic<MenuLayoutContentProps>(
    () => import('./layout-lookbook').then((m) => ({ default: m.LayoutLookbook })),
    { loading: LayoutSkeleton }
)

interface LayoutEntry {
    Component: ComponentType<MenuLayoutContentProps>
    /**
     * Renders every category on one scrolling page, so it reads the search
     * matches *before* any category filter (`searchItems`).
     */
    isScrollCatalog?: boolean
}

// Typed against the registry's id union: registering a layout without a
// component here is a compile error, not a silent fall back to Default.
const LAYOUTS = {
    default: { Component: LayoutDefault },
    sidebar: { Component: LayoutSidebar, isScrollCatalog: true },
    magazine: { Component: LayoutMagazine },
    'grid-focus': { Component: LayoutGridFocus },
    list: { Component: LayoutList },
    mosaic: { Component: LayoutMosaic },
    storefront: { Component: LayoutStorefront, isScrollCatalog: true },
    kiosk: { Component: LayoutKiosk, isScrollCatalog: true },
    rails: { Component: LayoutRails, isScrollCatalog: true },
    lookbook: { Component: LayoutLookbook, isScrollCatalog: true },
} satisfies Record<PageLayout, LayoutEntry>

function getLayoutEntry(layout: PageLayout): LayoutEntry {
    return LAYOUTS[pickDesignId(layout, PAGE_LAYOUT_IDS, DEFAULT_PAGE_LAYOUT)]
}

/** The component that renders a page layout. Unknown ids fall back to Default. */
export function getMenuLayoutComponent(layout: PageLayout) {
    return getLayoutEntry(layout).Component
}

export function MenuLayout({ layout, ...props }: MenuLayoutProps) {
    const { Component, isScrollCatalog } = getLayoutEntry(layout)
    const filteredItems = isScrollCatalog ? props.searchItems ?? props.filteredItems : props.filteredItems
    return <Component {...props} filteredItems={filteredItems} />
}
