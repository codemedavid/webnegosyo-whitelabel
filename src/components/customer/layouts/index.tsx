'use client'

import type { MenuLayoutContentProps } from '@/storefront/contracts'

import dynamic from 'next/dynamic'
import type { PageLayout } from '@/lib/page-layouts'

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
const LayoutDefault = dynamic(
    () => import('./layout-default').then((m) => ({ default: m.LayoutDefault })),
    { loading: LayoutSkeleton }
)
const LayoutSidebar = dynamic(
    () => import('./layout-sidebar').then((m) => ({ default: m.LayoutSidebar })),
    { loading: LayoutSkeleton }
)
const LayoutMagazine = dynamic(
    () => import('./layout-magazine').then((m) => ({ default: m.LayoutMagazine })),
    { loading: LayoutSkeleton }
)
const LayoutGridFocus = dynamic(
    () => import('./layout-grid-focus').then((m) => ({ default: m.LayoutGridFocus })),
    { loading: LayoutSkeleton }
)
const LayoutList = dynamic(
    () => import('./layout-list').then((m) => ({ default: m.LayoutList })),
    { loading: LayoutSkeleton }
)
const LayoutMosaic = dynamic(
    () => import('./layout-mosaic').then((m) => ({ default: m.LayoutMosaic })),
    { loading: LayoutSkeleton }
)

export function MenuLayout({ layout, isLoading, ...props }: MenuLayoutProps) {
    switch (layout) {
        case 'sidebar':
            return <LayoutSidebar {...props} filteredItems={props.searchItems ?? props.filteredItems} />
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
