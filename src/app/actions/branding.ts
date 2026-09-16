'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { invalidateTenantCache } from '@/lib/cache'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import {
    writeBrandingWithClient,
    type BrandingPatchInput,
    type SaveBrandingResult,
} from '@/lib/branding-service'

// NOTE: Do not re-export these types from this 'use server' module. Turbopack's
// server-action transform treats every export (including `export type`) as a
// runtime server-action entry and wraps them in ensureServerEntryExports([...]),
// which throws "BrandingPatchInput is not defined" at page-data collection because
// types are erased. Importers must pull BrandingPatchInput/SaveBrandingResult straight
// from '@/lib/branding-service' instead.

/**
 * Save branding settings and revalidate cached pages for instant updates.
 * This server action ensures that branding changes appear immediately
 * without requiring a page refresh or waiting for cache TTL to expire.
 *
 * When a ProvisioningCtx is supplied (e.g. the MCP admin surface), it uses the
 * injected service-role client and SKIPS cookie-based auth — the caller is
 * already authorized upstream (verifyMcpKey). The default web path verifies the
 * tenant admin and uses the cookie-scoped client.
 */
export async function saveBrandingAction(
    tenantId: string,
    tenantSlug: string,
    branding: BrandingPatchInput,
    ctx?: ProvisioningCtx
): Promise<SaveBrandingResult> {
    try {
        if (!ctx) {
            // Verify caller is admin of this tenant with store_setup permission
            await verifyTenantPermission(tenantId, 'store_setup')
        }

        const supabase = ctx?.client ?? (await createClient())

        const result = await writeBrandingWithClient(supabase, tenantId, branding)
        if (!result.success) {
            return result
        }

        // The write is committed. A cache outage must not report that saving
        // failed, and Next's route caches still need an invalidation attempt.
        try {
            await invalidateTenantCache(tenantSlug, tenantId)
        } catch (error) {
            console.warn('[saveBrandingAction] Branding saved, but tenant cache invalidation failed:', error)
        }

        // Layout invalidation covers descendants; footer branding also affects
        // content pages. Attempt every route even if one cache refresh fails.
        const routes: Array<[string, 'layout'?]> = [
            [`/${tenantSlug}/menu`, 'layout'],
            [`/${tenantSlug}/checkout`, 'layout'],
            [`/${tenantSlug}/cart`, 'layout'],
            [`/${tenantSlug}/admin/settings`],
            [`/${tenantSlug}`],
            [`/${tenantSlug}/about`],
            [`/${tenantSlug}/terms`],
            [`/${tenantSlug}/refund`],
            [`/${tenantSlug}/privacy`],
        ]
        for (const route of routes) {
            try {
                revalidatePath(...route)
            } catch (error) {
                console.warn(`[saveBrandingAction] Branding saved, but route invalidation failed for ${route[0]}:`, error)
            }
        }

        console.log(`[saveBrandingAction] Branding saved for ${tenantSlug}`)

        return result
    } catch (error) {
        console.error('[saveBrandingAction] Error:', error)

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
    }
}
