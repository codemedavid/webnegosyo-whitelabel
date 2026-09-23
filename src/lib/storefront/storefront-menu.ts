import type { MenuContents, MenuSnapshot } from '@/storefront/data/menu-data'
import type { MenuItem } from '@/types/database'
import { createPublicClient } from '@/lib/supabase/public'
import { createCachedRead, doNotCache, storefrontTag } from '@/lib/storefront/cached-read'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { hasCatalogFailure, loadStorefrontCatalog } from '@/lib/storefront/storefront-catalog'
import { decodeRowTable, encodeRowTable, type RowTable } from '@/lib/storefront/row-table-codec'

const EMPTY_MENU: MenuContents = {
  categories: [],
  menuItems: [],
  bundles: [],
  outlets: [],
  outletsFailed: false,
  menuOverrides: [],
  overridesFailed: false,
}

/**
 * The snapshot as it is stored: dishes as a column table, everything else as is.
 *
 * A large menu stored as plain rows repeats every column name in every row —
 * measured on a 4066-item store that was over half the entry, enough to cross
 * Next's 2 MB data-cache limit, after which every page view re-ran the whole
 * query plan. The table form is a storage detail: `getStorefrontMenu` decodes
 * it before anything renders.
 */
interface StoredMenuSnapshot {
  snapshot: MenuSnapshot
  menuItems: RowTable
}

function toStored(snapshot: MenuSnapshot): StoredMenuSnapshot {
  return { snapshot: { ...snapshot, menuItems: [] }, menuItems: encodeRowTable(snapshot.menuItems) }
}

function fromStored(stored: StoredMenuSnapshot): MenuSnapshot {
  return { ...stored.snapshot, menuItems: decodeRowTable<MenuItem>(stored.menuItems) }
}

interface BuiltMenu {
  snapshot: MenuSnapshot
  /** False for any failure: it reaches the visitor but never the cache. */
  isCacheable: boolean
}

async function buildStorefrontMenu(slug: string): Promise<BuiltMenu> {
  const { tenant, error: tenantError } = await getStorefrontTenant(slug)

  if (tenantError) {
    return {
      snapshot: { ...EMPTY_MENU, status: 'error', tenant: null, error: `Failed to load restaurant (${tenantError})` },
      isCacheable: false,
    }
  }
  if (!tenant) {
    return {
      snapshot: { ...EMPTY_MENU, status: 'not-found', tenant: null, error: 'Restaurant not found' },
      isCacheable: true,
    }
  }

  const { error, ...catalog } = await loadStorefrontCatalog(createPublicClient(), tenant)

  const snapshot: MenuSnapshot = error
    ? { ...catalog, status: 'error', tenant, error }
    : { ...catalog, status: 'ready', tenant, error: null }

  // A degraded snapshot reaches the visitor but never the cache: caching an
  // "ordering blocked" flag would keep the block for the whole window.
  return { snapshot, isCacheable: !hasCatalogFailure({ ...catalog, error }) }
}

async function loadStoredStorefrontMenu(slug: string) {
  const { snapshot, isCacheable } = await buildStorefrontMenu(slug)
  const stored = toStored(snapshot)
  return isCacheable ? stored : doNotCache(stored)
}

// The key names the storage format: entries written in the old plain-row
// shape must never be read back through the column-table decoder.
const getStoredStorefrontMenu = createCachedRead(['storefront-menu', 'row-table-v1'], loadStoredStorefrontMenu, {
  tags: (slug) => [storefrontTag(slug)],
})

/**
 * The whole public menu for a tenant, cached across requests.
 *
 * One entry per slug serves every visitor for `STOREFRONT_REVALIDATE_SECONDS`;
 * the database sees one query plan per window instead of one per page view.
 */
export async function getStorefrontMenu(slug: string): Promise<MenuSnapshot> {
  return fromStored(await getStoredStorefrontMenu(slug))
}
