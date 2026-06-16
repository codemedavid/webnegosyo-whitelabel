'use server'

/**
 * Server actions backing the product-detail bottom sheet.
 *
 * The sheet opens instantly from in-memory menu data (item, category, related
 * items) and hydrates the rest in the background:
 *  - getProductDetailSettings: tenant-level theme overrides, fetched ONCE when
 *    the sheet host mounts (item-invariant) so the theme is ready before the
 *    first open — no branding→custom repaint.
 *  - getProductDetailUpsells: per-item complementary/upgrade upsells + upsell
 *    bundles, fetched when the sheet opens or swaps items.
 *
 * Mirrors the parallel fetch in src/app/[tenant]/menu/item/[itemId]/page.tsx.
 */

import {
    getCachedProductDetailSettings,
    getCachedUpsellsForItem,
} from '@/lib/product-detail-data'
import { getUpsellBundles } from '@/lib/bundles-service'
import type { MenuItem, UpgradeUpsell, BundleWithSlots } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

export interface ProductDetailUpsells {
    complementaryUpsells: MenuItem[]
    upgradeUpsells: UpgradeUpsell[]
    upsellBundles: BundleWithSlots[]
}

interface GetProductDetailUpsellsInput {
    tenantId: string
    itemId: string
    categoryId?: string | null
    menuEngineeringEnabled?: boolean
    pairingRulesEnabled?: boolean
    bundlesEnabled?: boolean
}

const EMPTY_UPSELLS: ProductDetailUpsells = {
    complementaryUpsells: [],
    upgradeUpsells: [],
    upsellBundles: [],
}

/**
 * Tenant-level product detail theme settings. Item-invariant — fetch once.
 */
export async function getProductDetailSettings(
    tenantId: string
): Promise<ProductDetailSettings | null> {
    if (!tenantId) return null
    try {
        return await getCachedProductDetailSettings(tenantId)
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getProductDetailSettings:', errMsg)
        return null
    }
}

/**
 * Per-item upsell suggestions and upsell bundles.
 */
export async function getProductDetailUpsells(
    input: GetProductDetailUpsellsInput
): Promise<ProductDetailUpsells> {
    const {
        tenantId,
        itemId,
        categoryId,
        menuEngineeringEnabled = false,
        pairingRulesEnabled = false,
        bundlesEnabled = false,
    } = input

    if (!tenantId || !itemId) {
        return EMPTY_UPSELLS
    }

    try {
        const results = await Promise.allSettled([
            // Upsell suggestions (menu engineering OR pairing rules)
            (menuEngineeringEnabled || pairingRulesEnabled)
                ? getCachedUpsellsForItem(itemId, tenantId, categoryId ?? undefined, {
                    pairingRulesEnabled,
                })
                : Promise.resolve({ complementary: [], upgrades: [] }),

            // Bundle upsell suggestions (only when bundles enabled)
            bundlesEnabled ? getUpsellBundles(tenantId) : Promise.resolve([]),
        ])

        const upsells = results[0].status === 'fulfilled'
            ? results[0].value
            : { complementary: [], upgrades: [] }
        const upsellBundles = results[1].status === 'fulfilled' ? results[1].value : []

        return {
            complementaryUpsells: upsells.complementary,
            upgradeUpsells: upsells.upgrades,
            upsellBundles,
        }
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('Error in getProductDetailUpsells:', errMsg)
        return EMPTY_UPSELLS
    }
}
