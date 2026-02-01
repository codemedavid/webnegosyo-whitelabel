/**
 * Product Detail Page Caching Utilities
 * 
 * Implements caching strategies for product detail data to reduce
 * database queries and improve page load times.
 */

import { createClient } from '@/lib/supabase/client'
import type { ProductDetailSettings } from './product-detail-theme'

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

interface CacheEntry<T> {
    data: T
    timestamp: number
}

// In-memory cache for client-side
const clientCache = new Map<string, CacheEntry<unknown>>()

/**
 * Get cached data or fetch fresh data
 */
export async function getCachedOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    duration: number = CACHE_DURATION
): Promise<T> {
    const now = Date.now()
    const cached = clientCache.get(key) as CacheEntry<T> | undefined

    // Return cached data if still valid
    if (cached && (now - cached.timestamp) < duration) {
        return cached.data
    }

    // Fetch fresh data
    const data = await fetcher()

    // Cache the result
    clientCache.set(key, { data, timestamp: now })

    return data
}

/**
 * Clear specific cache entry
 */
export function clearCacheEntry(key: string): void {
    clientCache.delete(key)
}

/**
 * Clear all product detail cache
 */
export function clearProductDetailCache(): void {
    clientCache.clear()
}

/**
 * Prefetch product detail data
 * Call this when hovering over a menu item
 */
export async function prefetchProductDetail(
    tenantSlug: string,
    itemId: string
): Promise<void> {
    const supabase = createClient()

    // Use Promise.all to fetch in parallel
    await Promise.all([
        // Prefetch tenant
        getCachedOrFetch(
            `tenant:${tenantSlug}`,
            async () => {
                const { data, error } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('slug', tenantSlug)
                    .maybeSingle()
                if (error) {
                    console.error('Error prefetching tenant:', error.message)
                    throw error
                }
                return data
            },
            CACHE_DURATION
        ),

        // Prefetch item
        getCachedOrFetch(
            `item:${itemId}`,
            async () => {
                const { data, error } = await supabase
                    .from('menu_items')
                    .select('*')
                    .eq('id', itemId)
                    .maybeSingle()
                if (error) {
                    console.error('Error prefetching menu item:', error.message)
                    throw error
                }
                return data
            },
            CACHE_DURATION
        )
    ])
}

/**
 * Cache product detail settings
 */
export function cacheProductDetailSettings(
    tenantId: string,
    settings: ProductDetailSettings
): void {
    clientCache.set(`settings:${tenantId}`, { data: settings, timestamp: Date.now() })
}

/**
 * Get cached product detail settings
 */
export function getCachedProductDetailSettings(
    tenantId: string
): ProductDetailSettings | null {
    const cached = clientCache.get(`settings:${tenantId}`) as CacheEntry<ProductDetailSettings> | undefined

    if (!cached) return null

    // Check if cache is still valid
    if ((Date.now() - cached.timestamp) > CACHE_DURATION) {
        clientCache.delete(`settings:${tenantId}`)
        return null
    }

    return cached.data
}
