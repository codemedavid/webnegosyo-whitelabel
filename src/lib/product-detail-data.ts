/**
 * Optimized data fetching for product detail pages
 * Uses React cache() for per-request caching
 * Selective column queries to reduce payload size
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { MenuItem, Category, Variation, VariationType, Addon } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

/**
 * Partial tenant type reflecting only the selected columns from getCachedTenantBySlug
 */
export interface SelectedTenant {
    id: string
    slug: string
    name: string
    logo_url: string | null
    primary_color: string | null
    secondary_color: string | null
    background_color: string | null
    text_primary_color: string | null
    text_secondary_color: string | null
    border_color: string | null
    header_color: string | null
    cards_color: string | null
    is_active: boolean
}

// ============================================================================
// CRITICAL DATA - Fetches first, blocks initial paint (but cached)
// ============================================================================

/**
 * Fetch minimal tenant data for page rendering (cached per request)
 */
export const getCachedTenantBySlug = cache(async (slug: string): Promise<SelectedTenant | null> => {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('tenants')
            .select(`
                id, 
                slug, 
                name,
                logo_url, 
                primary_color, 
                secondary_color, 
                background_color, 
                text_primary_color, 
                text_secondary_color, 
                border_color, 
                header_color, 
                cards_color,
                is_active
            `)
            .eq('slug', slug)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            console.error('Error fetching tenant:', JSON.stringify(error, null, 2))
            return null
        }

        return data as SelectedTenant | null
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedTenantBySlug:', errMsg)
        return null
    }
})

/**
 * Fetch minimal menu item data for rendering (cached per request)
 */
export const getCachedMenuItemById = cache(async (itemId: string, tenantId: string): Promise<MenuItem | null> => {
    try {
        const supabase = await createClient()

        // Fetch menu item with JSONB columns (variations, variation_types, addons)
        // These are stored as JSONB in the menu_items table, not as separate tables
        const { data: itemData, error: itemError } = await supabase
            .from('menu_items')
            .select(`
                id,
                tenant_id,
                category_id,
                name,
                description,
                price,
                discounted_price,
                image_url,
                is_available,
                variations,
                variation_types,
                addons
            `)
            .eq('id', itemId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (itemError) {
            console.error('Error fetching menu item:', itemError?.message || itemError?.code || itemError)
            return null
        }

        if (!itemData) {
            console.warn(`Menu item not found: ${itemId} for tenant: ${tenantId}`)
            return null
        }

        // Parse JSONB columns with fallback to empty arrays
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variations = (itemData as any).variations || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variation_types = (itemData as any).variation_types || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const addons = (itemData as any).addons || []

        // Combine all data with proper type casting
        const fullItem: MenuItem = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(itemData as any),
            variations: variations as Variation[],
            variation_types: variation_types as VariationType[],
            addons: addons as Addon[]
        }

        return fullItem
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedMenuItemById:', errMsg)
        return null
    }
})

/**
 * Fetch minimal category data (cached per request)
 */
export const getCachedCategoryById = cache(async (categoryId: string, tenantId: string): Promise<Category | null> => {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('categories')
            .select('id, tenant_id, name, description, icon, order, is_active, created_at, updated_at')
            .eq('id', categoryId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching category:', JSON.stringify(error, null, 2))
            return null
        }

        return data as Category | null
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedCategoryById:', errMsg)
        return null
    }
})

// ============================================================================
// NON-CRITICAL DATA - Cached per request (React cache)
// Note: unstable_cache removed because it conflicts with cookies usage
// ============================================================================

/**
 * Fetch related items (cached per request)
 * Only select essential columns
 */
export const getCachedRelatedItems = cache(async (categoryId: string, tenantId: string, excludeItemId: string): Promise<MenuItem[]> => {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('menu_items')
            .select('id, name, price, discounted_price, image_url, category_id, tenant_id, is_available, description')
            .eq('category_id', categoryId)
            .eq('tenant_id', tenantId)
            .neq('id', excludeItemId)
            .eq('is_available', true)
            .limit(4)

        if (error) {
            console.error('Error fetching related items:', error?.message || error?.code || error)
            return []
        }

        // Map the data to include empty arrays for variations/addons/variation_types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemsWithDefaults = (data || []).map((item: any) => ({
            ...item,
            variations: [],
            variation_types: [],
            addons: []
        })) as MenuItem[]

        return itemsWithDefaults
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedRelatedItems:', errMsg)
        return []
    }
})

/**
 * Fetch product detail settings (cached per request)
 */
export const getCachedProductDetailSettings = cache(async (tenantId: string): Promise<ProductDetailSettings | null> => {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('product_detail_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching product detail settings:', error?.message || error?.code || error)
            return null
        }

        return data as ProductDetailSettings | null
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedProductDetailSettings:', errMsg)
        return null
    }
})
