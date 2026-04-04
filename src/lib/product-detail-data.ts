/**
 * Optimized data fetching for product detail pages
 * Uses React cache() for per-request caching
 * Selective column queries to reduce payload size
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getComplementaryItems } from '@/lib/complementary-pairs-service'
import type { MenuItem, Category, Variation, VariationType, Addon, UpgradeUpsell } from '@/types/database'
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
    text_muted_color: string | null
    border_color: string | null
    header_color: string | null
    header_font_color: string | null
    cards_color: string | null
    cards_border_color: string | null
    card_title_color: string | null
    card_price_color: string | null
    card_description_color: string | null
    modal_background_color: string | null
    modal_title_color: string | null
    modal_price_color: string | null
    modal_description_color: string | null
    button_primary_color: string | null
    button_primary_text_color: string | null
    button_secondary_color: string | null
    button_secondary_text_color: string | null
    link_color: string | null
    shadow_color: string | null
    success_color: string | null
    warning_color: string | null
    error_color: string | null
    accent_color: string | null
    is_active: boolean
    menu_engineering_enabled?: boolean
    hide_currency_symbol?: boolean
    checkout_upsell_enabled?: boolean
    checkout_upsell_title?: string | null
    checkout_upsell_subtitle?: string | null
    checkout_upsell_max_items?: number | null
    bundles_enabled?: boolean
    pairing_rules_enabled?: boolean
    // Convex integration (only non-secret fields - deploy_key must never be sent to client)
    convex_deployment_url?: string | null
    convex_schema_version?: number
    // Index signature for compatibility with getTenantBranding(Record<string, unknown>)
    [key: string]: unknown
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
                text_muted_color,
                border_color,
                header_color,
                header_font_color,
                cards_color,
                cards_border_color,
                card_title_color,
                card_price_color,
                card_description_color,
                modal_background_color,
                modal_title_color,
                modal_price_color,
                modal_description_color,
                button_primary_color,
                button_primary_text_color,
                button_secondary_color,
                button_secondary_text_color,
                link_color,
                shadow_color,
                success_color,
                warning_color,
                error_color,
                accent_color,
                is_active,
                menu_engineering_enabled,
                hide_currency_symbol,
                checkout_upsell_enabled,
                checkout_upsell_title,
                checkout_upsell_subtitle,
                checkout_upsell_max_items,
                bundles_enabled,
                pairing_rules_enabled,
                convex_deployment_url,
                convex_schema_version
            `)
            .eq('slug', slug)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            console.error('Error fetching tenant:', JSON.stringify(error, null, 2))
            return null
        }

        return data as unknown as SelectedTenant | null
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
            .select('id, tenant_id, name, description, icon, order, is_active, default_addons, created_at, updated_at')
            .eq('id', categoryId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching category:', JSON.stringify(error, null, 2))
            return null
        }

        return data as unknown as Category | null
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
 * Fetch upsell items for a given menu item (cached per request)
 * Returns complementary and upgrade suggestions separately
 */
export const getCachedUpsellsForItem = cache(async (
    itemId: string,
    tenantId: string,
    categoryId?: string,
    options?: { pairingRulesEnabled?: boolean }
): Promise<{ complementary: MenuItem[]; upgrades: UpgradeUpsell[] }> => {
    try {
        const supabase = await createClient()

        // Fetch complementary items from new table and upgrades from upsell_pairs in parallel
        const [complementary, upgradesResult] = await Promise.all([
            // Complementary pairs from dedicated table (item-level overrides category-level)
            categoryId
                ? getComplementaryItems(itemId, categoryId, tenantId, {
                    pairingRulesEnabled: options?.pairingRulesEnabled,
                  })
                : Promise.resolve([]),
            // Upgrade pairs still from upsell_pairs
            supabase
                .from('upsell_pairs')
                .select(`
                    source_label,
                    target_label,
                    upgrade_header,
                    target_item:menu_items!upsell_pairs_target_item_id_fkey(
                        id, tenant_id, category_id, name, description, price, discounted_price,
                        image_url, is_available, is_featured, variations, variation_types, addons
                    )
                `)
                .eq('source_item_id', itemId)
                .eq('tenant_id', tenantId)
                .eq('pair_type', 'upgrade')
                .eq('is_active', true)
                .order('display_order', { ascending: true }),
        ])

        if (upgradesResult.error) {
            console.error('Error fetching upgrade upsells:', upgradesResult.error)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapUpgrades = (rows: any[]): UpgradeUpsell[] =>
            rows
                .filter((row) => row.target_item?.is_available === true)
                .map((row) => ({
                    targetItem: {
                        ...row.target_item,
                        variations: row.target_item.variations || [],
                        variation_types: row.target_item.variation_types || [],
                        addons: row.target_item.addons || [],
                    } as MenuItem,
                    sourceLabel: row.source_label ?? null,
                    targetLabel: row.target_label ?? null,
                    upgradeHeader: row.upgrade_header ?? null,
                }))

        return {
            complementary,
            upgrades: mapUpgrades(upgradesResult.data || []),
        }
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedUpsellsForItem:', errMsg)
        return { complementary: [], upgrades: [] }
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

        return data as unknown as ProductDetailSettings | null
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedProductDetailSettings:', errMsg)
        return null
    }
})
