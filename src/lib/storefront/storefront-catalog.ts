import type { SupabaseClient } from '@supabase/supabase-js'
import type { BundleWithSlots, Category, Database, MenuItem, Outlet, OutletMenuOverride, Tenant } from '@/types/database'
import { MENU_ITEM_LIST_SELECT } from '@/lib/queries/menu-item-select'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { collectSlotCategoryIds, hydrateBundleSlots } from '@/lib/bundles/slot-hydration'

/** The subset of a Supabase client the catalog loader needs; injectable for tests. */
export type CatalogQueryClient = Pick<SupabaseClient<Database>, 'from'>

export interface StorefrontCatalog {
  categories: Category[]
  menuItems: MenuItem[]
  bundles: BundleWithSlots[]
  outlets: Outlet[]
  /** True when the branch query failed — ordering is blocked, the menu is not. */
  outletsFailed: boolean
  menuOverrides: OutletMenuOverride[]
  /** True when the override query failed — same treatment as `outletsFailed`. */
  overridesFailed: boolean
  /** Non-null when the category or item query failed; the menu cannot render. */
  error: string | null
}

const EMPTY_CATALOG: StorefrontCatalog = {
  categories: [],
  menuItems: [],
  bundles: [],
  outlets: [],
  outletsFailed: false,
  menuOverrides: [],
  overridesFailed: false,
  error: null,
}

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

const NO_QUERY: QueryResult<never> = { data: null, error: null }

/** Whether any query in the catalog failed; such a catalog must not be cached. */
export function hasCatalogFailure(catalog: StorefrontCatalog): boolean {
  return catalog.error !== null || catalog.outletsFailed || catalog.overridesFailed
}

async function hydrateBundles(
  client: CatalogQueryClient,
  tenantId: string,
  bundles: BundleWithSlots[]
): Promise<BundleWithSlots[]> {
  // ONE query for every slot category at once, then a pure assignment. This
  // used to await a query per slot. `is_available` is filtered here because a
  // slot *offers* a dish rather than listing it.
  const slotCategoryIds = collectSlotCategoryIds(bundles)
  if (slotCategoryIds.length === 0) return bundles

  const { data, error } = await client
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .in('category_id', slotCategoryIds)
    .order('order', { ascending: true })

  if (error) {
    console.warn('[storefront-catalog] Bundle slot items query failed:', error.message)
  }

  return hydrateBundleSlots(bundles, (data as unknown as MenuItem[] | null) ?? [])
}

/**
 * The menu page's query plan: categories, items, and — per feature flag —
 * bundles and branch data, all in one round of parallel queries.
 *
 * Branch failures are carried, not swallowed and not fatal: the menu still
 * renders, and `resolveOutletAvailability` turns the flag into a block on
 * ordering. Silently falling back to single-location behaviour would send a
 * multi-branch merchant's orders to the wrong kitchen.
 */
export async function loadStorefrontCatalog(client: CatalogQueryClient, tenant: Tenant): Promise<StorefrontCatalog> {
  const isMultiBranch = isMultiBranchEnabled(tenant)

  const bundlesQuery = tenant.bundles_enabled
    ? client
        .from('bundles')
        .select(`
          *,
          slots:bundle_slots(
            *,
            category:categories(id, name, icon, icon_color),
            price_overrides:bundle_slot_price_overrides(*)
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('show_on_menu', true)
        .order('display_order', { ascending: true })
    : Promise.resolve(NO_QUERY)

  const outletsQuery = isMultiBranch
    ? client.from('outlets').select(OUTLET_SELECT).eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order', { ascending: true })
    : Promise.resolve(NO_QUERY)

  // Every override for the tenant in one query, indexed in the browser: the
  // branch is chosen client-side and one cached page serves every branch.
  const overridesQuery = isMultiBranch
    ? client.from('outlet_menu_items').select(OUTLET_MENU_OVERRIDE_SELECT).eq('tenant_id', tenant.id)
    : Promise.resolve(NO_QUERY)

  const [cats, items, bundleRows, outletRows, overrideRows] = await Promise.all([
    client.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    // Deliberately unfiltered on `is_available`: an out-of-stock dish stays on
    // the menu, marked unavailable, rather than vanishing.
    client.from('menu_items').select(MENU_ITEM_LIST_SELECT).eq('tenant_id', tenant.id).order('order'),
    bundlesQuery,
    outletsQuery,
    overridesQuery,
  ])

  const outletsFailed = Boolean(outletRows.error)
  if (outletsFailed) console.warn('[storefront-catalog] Outlet query failed:', outletRows.error?.message)

  const overridesFailed = Boolean(overrideRows.error)
  if (overridesFailed) console.warn('[storefront-catalog] Branch menu query failed:', overrideRows.error?.message)

  if (cats.error || items.error) {
    const details = [
      cats.error?.message && `categories: ${cats.error.message}`,
      items.error?.message && `items: ${items.error.message}`,
    ].filter(Boolean).join('; ')
    // Branch flags are carried even here: the error state still renders the
    // ordering block from them.
    return { ...EMPTY_CATALOG, outletsFailed, overridesFailed, error: `Failed to load menu data (${details})` }
  }

  // Bundle failures are non-fatal — the dishes still show.
  if (bundleRows.error) console.warn('[storefront-catalog] Bundle query failed:', bundleRows.error.message)

  const bundleData = (bundleRows.data as unknown as BundleWithSlots[] | null) ?? []
  const hydrated = bundleData.length > 0 ? await hydrateBundles(client, tenant.id, bundleData) : []

  return {
    categories: (cats.data as unknown as Category[] | null) ?? [],
    menuItems: (items.data as unknown as MenuItem[] | null) ?? [],
    bundles: hydrated.filter((bundle) => (bundle.slots ?? []).length > 0),
    outlets: (outletRows.data as unknown as Outlet[] | null) ?? [],
    outletsFailed,
    menuOverrides: (overrideRows.data as unknown as OutletMenuOverride[] | null) ?? [],
    overridesFailed,
    error: null,
  }
}
