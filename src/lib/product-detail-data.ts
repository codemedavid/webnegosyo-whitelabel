/**
 * Data fetching for product detail pages.
 *
 * Public reads go through the cookie-free public client and the storefront
 * data cache (`createCachedRead`), so one visitor's page view populates the
 * entry every later visitor is served from. `cache()` from React additionally
 * dedupes the same read within one request (`generateMetadata` + the page).
 *
 * Failures are returned as `doNotCache(...)` so a transient timeout never
 * pins an empty result for the revalidation window.
 */

import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/public'
import { createCachedRead, doNotCache, storefrontTag, storefrontTenantIdTag } from '@/lib/storefront/cached-read'
import { omitTenantSecrets } from '@/lib/tenant-public'
import { PRODUCT_DETAIL_TENANT_SELECT } from '@/lib/queries/product-detail-tenant-select'
import { MENU_ITEM_DETAIL_SELECT } from '@/lib/queries/menu-item-select'
import type { LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { fetchActiveTenantBySlug, asTenantQueryClient } from '@/lib/queries/fetch-tenant-by-slug'
import { getComplementaryItems } from '@/lib/complementary-pairs-service'
import type { MenuItem, Category, Variation, VariationType, Addon, ModifierGroup, UpgradeUpsell } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

/**
 * Partial tenant type reflecting only the selected columns from getCachedTenantBySlug
 */
export interface SelectedTenant {
    id: string
    slug: string
    /** Opt-in flag for branches; when true the page prices per branch. */
    multi_branch_enabled?: boolean | null
    name: string
    logo_url: string | null
    primary_color: string | null
    secondary_color: string | null
    background_color: string | null
    // Custom page background (see src/lib/background-overlay.ts)
    background_image_url?: string | null
    background_image_opacity?: number | null
    background_image_fit?: string | null
    background_image_position?: string | null
    background_image_attachment?: string | null
    background_overlay_color?: string | null
    background_overlay_opacity?: number | null
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
    /** Per-date presell stock (see src/lib/presell). */
    presell_enabled?: boolean
    /** Unified modifier groups (multi-select with min/max picks) on the storefront. */
    modifier_groups_enabled?: boolean
    // Convex integration (only non-secret fields - deploy_key must never be sent to client)
    convex_deployment_url?: string | null
    // Operating hours + storefront enforcement (see src/lib/store-open-status.ts)
    operating_hours?: unknown
    timezone?: string | null
    enforce_operating_hours?: boolean | null
    convex_schema_version?: number
    // Search bar branding fields
    search_bar_enabled?: boolean
    search_bar_background?: string | null
    search_bar_text?: string | null
    search_bar_placeholder?: string | null
    search_bar_icon?: string | null
    search_bar_border?: string | null
    search_bar_focus_ring?: string | null
    search_bar_radius?: 'pill' | 'rounded' | 'square'
    search_bar_style?: 'filled' | 'outline' | 'ghost'
    // Index signature for compatibility with getTenantBranding(Record<string, unknown>)
    [key: string]: unknown
}

// ============================================================================
// CRITICAL DATA - Fetches first, blocks initial paint (but cached)
// ============================================================================

/** Minimal tenant data for page rendering. Cached across requests by slug. */
export const getCachedTenantBySlug = cache(
    createCachedRead(['product-detail-tenant'], async (slug: string) => {
        const { tenant, error, isDegraded } = await fetchActiveTenantBySlug<SelectedTenant>(
            asTenantQueryClient(createPublicClient()),
            slug,
            PRODUCT_DETAIL_TENANT_SELECT
        )

        if (error) {
            console.error('Error fetching tenant:', error)
            return doNotCache<SelectedTenant | null>(null)
        }

        // The migration-drift fallback is a `*` row: strip credential columns
        // and never persist it (see storefront-tenant.ts).
        if (isDegraded) return doNotCache<SelectedTenant | null>(omitTenantSecrets(tenant))

        return tenant
    }, { tags: (slug) => [storefrontTag(slug)] })
)

/** The menu item with its JSONB customisation columns. Cached across requests. */
export const getCachedMenuItemById = cache(
    createCachedRead(['product-detail-item'], async (itemId: string, tenantId: string) => {
        const { data: itemData, error: itemError } = await createPublicClient()
            .from('menu_items')
            .select(MENU_ITEM_DETAIL_SELECT)
            .eq('id', itemId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (itemError) {
            console.error('Error fetching menu item:', itemError.message || itemError.code)
            return doNotCache<MenuItem | null>(null)
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
        // Unified modifier groups. Left undefined (not []) when absent so the
        // storefront hook's `active` check keeps legacy items on the legacy path.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modifier_groups = (itemData as any).modifier_groups as ModifierGroup[] | undefined

        const fullItem: MenuItem = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(itemData as any),
            modifier_groups: modifier_groups?.length ? modifier_groups : undefined,
            variations: variations as Variation[],
            variation_types: variation_types as VariationType[],
            addons: addons as Addon[]
        }

        return fullItem
    }, { tags: (_itemId, tenantId) => [storefrontTenantIdTag(tenantId)] })
)

/** Minimal category data for breadcrumbs. Cached across requests. */
export const getCachedCategoryById = cache(
    createCachedRead(['product-detail-category'], async (categoryId: string, tenantId: string) => {
        const { data, error } = await createPublicClient()
            .from('categories')
            .select('id, tenant_id, name, description, icon, order, is_active, default_addons, created_at, updated_at')
            .eq('id', categoryId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching category:', error.message)
            return doNotCache<Category | null>(null)
        }

        return data as unknown as Category | null
    }, { tags: (_categoryId, tenantId) => [storefrontTenantIdTag(tenantId)] })
)

// ============================================================================
// NON-CRITICAL DATA
// ============================================================================

/** Up to four other available dishes in the same category. Cached across requests. */
export const getCachedRelatedItems = cache(
    createCachedRead(['product-detail-related'], async (categoryId: string, tenantId: string, excludeItemId: string) => {
        const { data, error } = await createPublicClient()
            .from('menu_items')
            .select('id, name, price, discounted_price, image_url, category_id, tenant_id, is_available, description')
            .eq('category_id', categoryId)
            .eq('tenant_id', tenantId)
            .neq('id', excludeItemId)
            .eq('is_available', true)
            .limit(4)

        if (error) {
            console.error('Error fetching related items:', error.message)
            return doNotCache<MenuItem[]>([])
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((item: any) => ({
            ...item,
            variations: [],
            variation_types: [],
            addons: []
        })) as MenuItem[]
    }, { tags: (_categoryId, tenantId) => [storefrontTenantIdTag(tenantId)] })
)

/**
 * Upsell items for a given menu item — complementary and upgrade suggestions.
 *
 * Per-request only: `getComplementaryItems` still reads through the
 * cookie-bound client, which cannot sit inside the storefront cache. Moving
 * the pairing services onto the public client is the next step.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toUpgradeUpsells = (rows: any[]): UpgradeUpsell[] =>
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

/**
 * Upgrade pairs for one product, read through the public client (anon RLS
 * allows active pairs and available items) so every product view and
 * quick-view sheet is served from the storefront cache instead of paying an
 * `upsell_pairs` query. Only purchasable targets are kept.
 */
const getCachedUpgradeUpsells = createCachedRead(
    ['product-detail-upgrades'],
    async (itemId: string, tenantId: string) => {
        const { data, error } = await createPublicClient()
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
            .order('display_order', { ascending: true })

        if (error) {
            console.error('Error fetching upgrade upsells:', error.message)
            return doNotCache<UpgradeUpsell[]>([])
        }

        return toUpgradeUpsells(data ?? [])
    },
    { tags: (_itemId, tenantId) => [storefrontTenantIdTag(tenantId)] }
)

export const getCachedUpsellsForItem = cache(async (
    itemId: string,
    tenantId: string,
    categoryId?: string,
    options?: { pairingRulesEnabled?: boolean }
): Promise<{ complementary: MenuItem[]; upgrades: UpgradeUpsell[] }> => {
    try {
        // Complementary pairs come from their own table (item-level overrides category-level)
        const [complementary, upgrades] = await Promise.all([
            categoryId
                ? getComplementaryItems(itemId, categoryId, tenantId, {
                    pairingRulesEnabled: options?.pairingRulesEnabled,
                  })
                : Promise.resolve([]),
            getCachedUpgradeUpsells(itemId, tenantId),
        ])

        return { complementary, upgrades }
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getCachedUpsellsForItem:', errMsg)
        return { complementary: [], upgrades: [] }
    }
})

/** Product detail page settings. Cached across requests. */
export const getCachedProductDetailSettings = cache(
    createCachedRead(['product-detail-settings'], async (tenantId: string) => {
        const { data, error } = await createPublicClient()
            .from('product_detail_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching product detail settings:', error.message)
            return doNotCache<ProductDetailSettings | null>(null)
        }

        return data as unknown as ProductDetailSettings | null
    }, { tags: (tenantId) => [storefrontTenantIdTag(tenantId)] })
)

/**
 * The menu items referenced by linked add-on options.
 *
 * Only the fields a linked option renders are selected. Items that no longer
 * exist simply do not come back; `resolveLinkedOptions` then renders that
 * option as unavailable rather than blank. The cache stores the rows (a `Map`
 * does not survive JSON); the map is built outside the cache boundary.
 */
const getCachedLinkedModifierRows = createCachedRead(
    ['product-detail-linked-items'],
    async (itemIds: readonly string[], tenantId: string) => {
        const { data, error } = await createPublicClient()
            .from('menu_items')
            .select('id, name, price, discounted_price, image_url, is_available')
            .eq('tenant_id', tenantId)
            .in('id', itemIds as string[])

        if (error) {
            console.error('Error fetching linked modifier items:', error.message)
            return doNotCache<LinkedItemSnapshot[]>([])
        }

        return (data ?? []) as unknown as LinkedItemSnapshot[]
    },
    { tags: (_itemIds, tenantId) => [storefrontTenantIdTag(tenantId)] }
)

export const getCachedLinkedModifierItems = cache(async (
    itemIds: readonly string[],
    tenantId: string
): Promise<Map<string, LinkedItemSnapshot>> => {
    if (itemIds.length === 0) {
        return new Map()
    }
    // Sorted so the cache key is independent of option order.
    const rows = await getCachedLinkedModifierRows([...itemIds].sort(), tenantId)
    return new Map(rows.map((row) => [row.id, row]))
})
