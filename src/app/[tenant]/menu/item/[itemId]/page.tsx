import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { getTenantBranding } from '@/lib/branding-utils'
import { ProductDetailContent } from '@/components/customer/product-detail-content'
import {
    getCachedTenantBySlug,
    getCachedMenuItemById,
    getCachedCategoryById,
    getCachedRelatedItems,
    getCachedProductDetailSettings
} from '@/lib/product-detail-data'
import type { MenuItem, Category } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

interface Props {
    params: Promise<{ tenant: string; itemId: string }>
}

// Cache the page for 5 minutes with ISR
export const revalidate = 300
export const dynamicParams = true
export const fetchCache = 'default-cache'

// Generate dynamic metadata for SEO (kept lightweight)
export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    try {
        const { tenant: tenantSlug, itemId } = await params

        // Fetch tenant first
        const tenant = await getCachedTenantBySlug(tenantSlug)

        if (!tenant) {
            return { title: 'Restaurant Not Found' }
        }

        // Fetch item
        const item = await getCachedMenuItemById(itemId, tenant.id)

        // Validate item belongs to tenant
        if (!item || item.tenant_id !== tenant.id) {
            return { title: 'Item Not Found' }
        }

        const previousImages = (await parent).openGraph?.images || []

        return {
            title: `${item.name} | ${tenant.name}`,
            description: item.description || `Order ${item.name} online`,
            openGraph: {
                title: item.name,
                description: item.description || `Order ${item.name} online`,
                images: item.image_url ? [item.image_url, ...previousImages] : previousImages,
            },
        }
    } catch (error) {
        console.error('Error generating metadata:', error)
        return { title: 'Product Detail' }
    }
}

// Main page component - fetches critical data first, then non-critical in parallel
export default async function ProductDetailPage({ params }: Props) {
    try {
        const { tenant: tenantSlug, itemId } = await params

        // Fetch CRITICAL data first (tenant + item) - blocks render
        const tenant = await getCachedTenantBySlug(tenantSlug)

        if (!tenant) {
            notFound()
        }

        // Fetch item with tenant validation
        const item = await getCachedMenuItemById(itemId, tenant.id)

        if (!item) {
            notFound()
        }

        // Validate item belongs to tenant
        if (item.tenant_id !== tenant.id) {
            notFound()
        }

        const branding = getTenantBranding(tenant)

        // Fetch NON-CRITICAL data in parallel (doesn't block - uses defaults if fails)
        let category: Category | null = null
        let relatedItems: MenuItem[] = []
        let customization: ProductDetailSettings | null = null

        try {
            const results = await Promise.allSettled([
                // Category for breadcrumbs
                item.category_id
                    ? getCachedCategoryById(item.category_id, tenant.id)
                    : Promise.resolve(null),

                // Related items
                item.category_id
                    ? getCachedRelatedItems(item.category_id, tenant.id, item.id)
                    : Promise.resolve([]),

                // Product detail settings
                getCachedProductDetailSettings(tenant.id)
            ])

            // Extract values from results, using defaults for failures
            category = results[0].status === 'fulfilled' ? results[0].value : null
            relatedItems = results[1].status === 'fulfilled' ? results[1].value : []
            customization = results[2].status === 'fulfilled' ? results[2].value : null

            // Log any failures for debugging
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const labels = ['category', 'relatedItems', 'customization']
                    console.warn(`Failed to fetch ${labels[index]}:`, result.reason)
                }
            })
        } catch (nonCriticalError) {
            // Non-critical data failed, but we can still render the page
            console.warn('Non-critical data fetch failed:', nonCriticalError)
        }

        return (
            <ProductDetailContent
                tenant={tenant}
                item={item}
                branding={branding}
                category={category}
                relatedItems={relatedItems}
                customization={customization}
            />
        )
    } catch (error) {
        console.error('Error loading product detail page:', error)
        notFound()
    }
}
