'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import {
    writeBrandingWithClient,
    type BrandingInput,
    type SaveBrandingResult,
} from '@/lib/branding-service'

// Re-export types so existing importers of these from the action keep working.
// (A 'use server' module may only export async functions and types, not values.)
export type { BrandingInput, SaveBrandingResult }

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
    branding: BrandingInput,
    ctx?: ProvisioningCtx
): Promise<SaveBrandingResult> {
    try {
        if (!ctx) {
            // Verify caller is admin of this tenant (or superadmin)
            await verifyTenantAdmin(tenantId)
        }

        const supabase = ctx?.client ?? (await createClient())

        const result = await writeBrandingWithClient(supabase, tenantId, branding)
        if (!result.success) {
            return result
        }

        // Revalidate all affected pages for instant updates
        // Using 'layout' type revalidates the route and all its children
        revalidatePath(`/${tenantSlug}/menu`, 'layout')
        // Checkout/cart design changes must invalidate those routes too
        revalidatePath(`/${tenantSlug}/checkout`, 'layout')
        revalidatePath(`/${tenantSlug}/cart`, 'layout')
        revalidatePath(`/${tenantSlug}/admin/settings`)
        // Footer also drives the storefront and content pages
        revalidatePath(`/${tenantSlug}`)
        revalidatePath(`/${tenantSlug}/about`)
        revalidatePath(`/${tenantSlug}/terms`)
        revalidatePath(`/${tenantSlug}/refund`)
        revalidatePath(`/${tenantSlug}/privacy`)

        console.log(`[saveBrandingAction] Branding saved and cache revalidated for ${tenantSlug}`)

        return result
    } catch (error) {
        console.error('[saveBrandingAction] Error:', error)

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
    }
}
