'use client'

import dynamic from 'next/dynamic'
import { RelatedItemsSkeleton } from './product-detail-related'

// Lazy-load the ImageModal component (loaded when user clicks to open)
export const LazyImageModal = dynamic(
    () => import('./product-detail-image-modal').then(mod => ({ default: mod.ImageModal })),
    { ssr: false }
)

// Lazy-load the ProductDetailCustomizer (admin-only component)
export const LazyProductDetailCustomizer = dynamic(
    () => import('../admin/product-detail-customizer').then(mod => ({ default: mod.ProductDetailCustomizer })),
    { ssr: false }
)

// Lazy-load the RelatedItemsSection with a skeleton fallback
export const LazyRelatedItemsSection = dynamic(
    () => import('./product-detail-related').then(mod => ({ default: mod.RelatedItemsSection })),
    {
        ssr: false,
        loading: () => <RelatedItemsSkeleton />
    }
)
