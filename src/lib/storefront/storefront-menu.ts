import type { MenuContents, MenuSnapshot } from '@/storefront/data/menu-data'
import { createPublicClient } from '@/lib/supabase/public'
import { createCachedRead, doNotCache, storefrontTag } from '@/lib/storefront/cached-read'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { hasCatalogFailure, loadStorefrontCatalog } from '@/lib/storefront/storefront-catalog'

const EMPTY_MENU: MenuContents = {
  categories: [],
  menuItems: [],
  bundles: [],
  outlets: [],
  outletsFailed: false,
  menuOverrides: [],
  overridesFailed: false,
}

async function loadStorefrontMenu(slug: string) {
  const { tenant, error: tenantError } = await getStorefrontTenant(slug)

  if (tenantError) {
    return doNotCache<MenuSnapshot>({
      ...EMPTY_MENU, status: 'error', tenant: null, error: `Failed to load restaurant (${tenantError})`,
    })
  }
  if (!tenant) {
    return { ...EMPTY_MENU, status: 'not-found', tenant: null, error: 'Restaurant not found' } satisfies MenuSnapshot
  }

  const { error, ...catalog } = await loadStorefrontCatalog(createPublicClient(), tenant)

  const snapshot: MenuSnapshot = error
    ? { ...catalog, status: 'error', tenant, error }
    : { ...catalog, status: 'ready', tenant, error: null }

  // A degraded snapshot reaches the visitor but never the cache: caching an
  // "ordering blocked" flag would keep the block for the whole window.
  return hasCatalogFailure({ ...catalog, error }) ? doNotCache(snapshot) : snapshot
}

/**
 * The whole public menu for a tenant, cached across requests.
 *
 * One entry per slug serves every visitor for `STOREFRONT_REVALIDATE_SECONDS`;
 * the database sees one query plan per window instead of one per page view.
 */
export const getStorefrontMenu = createCachedRead(['storefront-menu'], loadStorefrontMenu, {
  tags: (slug) => [storefrontTag(slug)],
})
