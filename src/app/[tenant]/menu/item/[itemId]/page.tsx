import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { getTenantBranding } from '@/lib/branding-utils'
import { ProductDetailContent } from '@/components/customer/product-detail-content'
import {
    getCachedTenantBySlug,
    getCachedMenuItemById,
    getCachedCategoryById,
    getCachedRelatedItems,
    getCachedProductDetailSettings,
    getCachedUpsellsForItem
} from '@/lib/product-detail-data'
import { getUpsellBundles } from '@/lib/bundles-service'
import { transformImageUrl as transformCloudinaryUrl, isOptimizableImageUrl as isCloudinaryUrl } from '@/lib/imagekit-utils'
import { createClient } from '@/lib/supabase/server'
import type { MenuItem, Category, UpgradeUpsell } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import type { BundleWithSlots } from '@/types/database'

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
        let complementaryUpsells: MenuItem[] = []
        let upgradeUpsells: UpgradeUpsell[] = []
        let upsellBundles: BundleWithSlots[] = []

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
                getCachedProductDetailSettings(tenant.id),

                // Upsell suggestions (menu engineering OR pairing rules)
                (tenant.menu_engineering_enabled || tenant.pairing_rules_enabled)
                    ? getCachedUpsellsForItem(item.id, tenant.id, item.category_id, {
                        pairingRulesEnabled: !!tenant.pairing_rules_enabled,
                      })
                    : Promise.resolve({ complementary: [], upgrades: [] }),

                // Bundle upsell suggestions (only when bundles enabled)
                tenant.bundles_enabled
                    ? getUpsellBundles(tenant.id)
                    : Promise.resolve([]),
            ])

            // Extract values from results, using defaults for failures
            category = results[0].status === 'fulfilled' ? results[0].value : null
            relatedItems = results[1].status === 'fulfilled' ? results[1].value : []
            customization = results[2].status === 'fulfilled' ? results[2].value : null
            complementaryUpsells = results[3].status === 'fulfilled' ? results[3].value.complementary : []
            upgradeUpsells = results[3].status === 'fulfilled' ? results[3].value.upgrades : []
            upsellBundles = results[4].status === 'fulfilled' ? results[4].value : []

            // Log any failures for debugging
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const labels = ['category', 'relatedItems', 'customization', 'upsells', 'upsellBundles']
                    console.warn(`Failed to fetch ${labels[index]}:`, result.reason)
                }
            })
        } catch (nonCriticalError) {
            // Non-critical data failed, but we can still render the page
            console.warn('Non-critical data fetch failed:', nonCriticalError)
        }

        // Check if the current user is a brand admin (server-side)
        let isBrandAdmin = false
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: role } = await supabase
                    .from('app_users')
                    .select('role, tenant_id')
                    .eq('user_id', user.id)
                    .maybeSingle()
                const userRole = role as { role: string; tenant_id: string | null } | null
                isBrandAdmin = !!userRole && (
                    userRole.role === 'superadmin' ||
                    (userRole.role === 'admin' && userRole.tenant_id === tenant.id)
                )
            }
        } catch {
            // Non-critical: admin check failed, default to false
        }

        // Preload the hero image so it's fetched before the client JS hydrates.
        // Uses 1280px width (matches OptimizedImage: sizes="(max-width:640px) 100vw, …, 800px" → max ~640*2=1280).
        const preloadImageUrl = item.image_url
            ? isCloudinaryUrl(item.image_url)
                ? transformCloudinaryUrl(item.image_url, {
                    width: 1280,
                    quality: 'auto',
                    crop: 'limit',
                }) || item.image_url
                : item.image_url
            : null

        return (
            <>
                {preloadImageUrl && (
                    <link
                        rel="preload"
                        as="image"
                        href={preloadImageUrl}
                        fetchPriority="high"
                    />
                )}
                <ProductDetailContent
                    tenant={tenant}
                    item={item}
                    branding={branding}
                    category={category}
                    relatedItems={relatedItems}
                    customization={customization}
                    complementaryUpsells={complementaryUpsells}
                    upgradeUpsells={upgradeUpsells}
                    menuEngineeringEnabled={tenant.menu_engineering_enabled}
                    pairingRulesEnabled={!!tenant.pairing_rules_enabled}
                    hideCurrencySymbol={!!(tenant.menu_engineering_enabled && tenant.hide_currency_symbol)}
                    upsellBundles={upsellBundles}
                    bundlesEnabled={!!tenant.bundles_enabled}
                    isBrandAdmin={isBrandAdmin}
                />
            </>
        )
    } catch (error) {
        console.error('Error loading product detail page:', error)
        notFound()
    }
}
