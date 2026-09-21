import type { Tenant } from '@/types/database'
import { createPublicClient, describePublicQueryError } from '@/lib/supabase/public'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { asTenantQueryClient, fetchActiveTenantBySlug } from '@/lib/queries/fetch-tenant-by-slug'
import { createCachedRead, doNotCache, storefrontTag } from '@/lib/storefront/cached-read'
import { omitTenantSecrets } from '@/lib/tenant-public'

export interface StorefrontTenantResult {
  /** The active tenant, or null when none exists or the read failed. */
  tenant: Tenant | null
  /** Non-null only for a real failure — an absent tenant is not an error. */
  error: string | null
}

async function loadStorefrontTenant(slug: string) {
  try {
    const { tenant, error, isDegraded } = await fetchActiveTenantBySlug<Tenant>(
      asTenantQueryClient(createPublicClient()),
      slug,
      TENANT_STOREFRONT_SELECT
    )
    if (error) return doNotCache<StorefrontTenantResult>({ tenant: null, error: describePublicQueryError(error) })
    // The migration-drift fallback is a `*` row: strip credential columns before
    // it can reach a client component, and never persist it — a full row cached
    // for the whole window would be served to every visitor of the tenant.
    if (isDegraded) return doNotCache<StorefrontTenantResult>({ tenant: omitTenantSecrets(tenant), error: null })
    // A genuine miss IS cached: an unknown slug hammering the database on every
    // request is the same amplifier as a known one.
    return { tenant, error: null } satisfies StorefrontTenantResult
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    return doNotCache<StorefrontTenantResult>({ tenant: null, error: describePublicQueryError(message) })
  }
}

/**
 * The one tenant read every public storefront surface shares.
 *
 * The tenant layout, the menu layout and the menu page used to run three
 * separate tenant queries per page view (`*`, `name, font_pair`, and the
 * storefront projection). They now share this cached read; the projection
 * covers every column all three render.
 */
export const getStorefrontTenant = createCachedRead(['storefront-tenant'], loadStorefrontTenant, {
  tags: (slug) => [storefrontTag(slug)],
})
