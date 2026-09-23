'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import { saveBrandingWithClient } from '@/lib/branding-write'
import type { BrandingPatchInput, SaveBrandingResult } from '@/lib/branding-service'

// NOTE: Do not re-export these types from this 'use server' module. Turbopack's
// server-action transform treats every export (including `export type`) as a
// runtime server-action entry and wraps them in ensureServerEntryExports([...]),
// which throws "BrandingPatchInput is not defined" at page-data collection because
// types are erased. Importers must pull BrandingPatchInput/SaveBrandingResult straight
// from '@/lib/branding-service' instead.

/**
 * Save branding settings and revalidate cached pages for instant updates.
 *
 * This is a public endpoint: a browser can call it with ANY arguments, so it
 * takes no "already authorized" escape hatch. Every call verifies the caller
 * holds `store_setup` on `tenantId` and writes through the caller's own
 * cookie-scoped client (RLS still applies). Privileged server-side callers
 * (the MCP provisioning ops) use `saveBrandingWithClient` in
 * `@/lib/branding-write` instead.
 *
 * `_tenantSlug` is accepted for call-site compatibility and IGNORED: caches are
 * purged under the slug stored for `tenantId`. A client-chosen slug such as
 * `[tenant]` would otherwise purge every tenant's storefront.
 */
export async function saveBrandingAction(
    tenantId: string,
    _tenantSlug: string,
    branding: BrandingPatchInput,
): Promise<SaveBrandingResult> {
    try {
        await verifyTenantPermission(tenantId, 'store_setup')

        const supabase = await createClient()
        // The slug is read with the service client only AFTER the permission
        // check, and only for the tenant the caller was authorized for.
        return await saveBrandingWithClient(supabase, tenantId, branding, createAdminClient())
    } catch (error) {
        console.error('[saveBrandingAction] Error:', error)

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
    }
}
