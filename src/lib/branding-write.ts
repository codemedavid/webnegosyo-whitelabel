import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { invalidateTenantCache } from '@/lib/cache'
import { writeBrandingWithClient, type BrandingPatchInput, type SaveBrandingResult } from '@/lib/branding-service'
import { readTenantSlugById } from '@/lib/tenant-revalidation'

/**
 * Branding writes that have ALREADY been authorized, plus the cache refresh
 * that must follow them.
 *
 * This is deliberately NOT a `'use server'` module. Every export of an action
 * module is a public endpoint a browser can call with any arguments, so the old
 * "pass a ProvisioningCtx to skip the permission check" parameter on
 * `saveBrandingAction` let any signed-in staff account skip `store_setup` by
 * sending `{}`. Privileged callers (the MCP provisioning ops, which verify their
 * credential upstream) import `saveBrandingWithClient` from here instead.
 */

type BrandingRoute = readonly [path: string, type?: 'layout']

/** Layout invalidation covers descendants; footer branding also reaches content pages. */
function brandingRoutes(slug: string): BrandingRoute[] {
  return [
    [`/${slug}/menu`, 'layout'],
    [`/${slug}/checkout`, 'layout'],
    [`/${slug}/cart`, 'layout'],
    [`/${slug}/admin/settings`],
    [`/${slug}`],
    [`/${slug}/about`],
    [`/${slug}/terms`],
    [`/${slug}/refund`],
    [`/${slug}/privacy`],
  ]
}

/**
 * Invalidate the tenant data cache and every storefront route branding
 * touches. The write is already committed, so each failure is logged and the
 * remaining routes are still attempted.
 */
export async function refreshBrandingCaches(tenantId: string, slug: string): Promise<void> {
  try {
    await invalidateTenantCache(slug, tenantId)
  } catch (error) {
    console.warn('[refreshBrandingCaches] Branding saved, but tenant cache invalidation failed:', error)
  }

  for (const [path, type] of brandingRoutes(slug)) {
    try {
      if (type) revalidatePath(path, type)
      else revalidatePath(path)
    } catch (error) {
      console.warn(`[refreshBrandingCaches] Branding saved, but route invalidation failed for ${path}:`, error)
    }
  }
}

/**
 * Write branding with `writeClient`, then refresh caches under the slug that
 * `slugClient` reads for `tenantId` — never a caller-supplied slug. A slug that
 * cannot be read skips the refresh (the ISR TTL still expires the old page).
 */
export async function saveBrandingWithClient(
  writeClient: SupabaseClient<Database>,
  tenantId: string,
  branding: BrandingPatchInput,
  slugClient: SupabaseClient<Database> = writeClient,
): Promise<SaveBrandingResult> {
  const result = await writeBrandingWithClient(writeClient, tenantId, branding)
  if (!result.success) return result

  const slug = await readTenantSlugById(slugClient, tenantId).catch((error: unknown) => {
    console.warn('[saveBrandingWithClient] Branding saved, but the tenant slug could not be read:', error)
    return null
  })
  if (slug) {
    await refreshBrandingCaches(tenantId, slug)
  } else {
    console.warn(`[saveBrandingWithClient] Branding saved for ${tenantId}, but caches were not refreshed (no usable slug)`)
  }
  return result
}
