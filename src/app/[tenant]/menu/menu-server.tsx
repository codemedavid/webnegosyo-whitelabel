import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem, BundleWithSlots } from '@/types/database'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { fetchActiveTenantBySlug, asTenantQueryClient } from '@/lib/queries/fetch-tenant-by-slug'
import { MENU_ITEM_LIST_SELECT } from '@/lib/queries/menu-item-select'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import type { Outlet, OutletMenuOverride } from '@/types/database'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { tenant: tenantData, error: tenantError } = await fetchActiveTenantBySlug<Tenant>(
    asTenantQueryClient(supabase),
    tenantSlug,
    TENANT_STOREFRONT_SELECT
  )

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], outlets: [] as Outlet[], outletsFailed: false, menuOverrides: [] as OutletMenuOverride[], overridesFailed: false, isBrandAdmin: false, error: 'Restaurant not found' }
  }

  const tenant = tenantData as unknown as Tenant

  // Fetch categories, items, and bundles in parallel for better performance
  const bundlesQuery = tenant.bundles_enabled
    ? supabase
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
    : Promise.resolve({ data: null, error: null })

  // Branches are only read for a tenant that opted in; every other tenant runs
  // exactly the queries it ran before this feature existed.
  const outletsQuery = isMultiBranchEnabled(tenant)
    ? supabase
        .from('outlets')
        .select(OUTLET_SELECT)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
    : Promise.resolve({ data: null, error: null })

  // Per-branch listings and prices. Fetched for the whole tenant in one query
  // and indexed in the browser, because the branch is chosen client-side and
  // this page is ISR-cached for every branch at once — see `useBranchMenu`.
  const overridesQuery = isMultiBranchEnabled(tenant)
    ? supabase
        .from('outlet_menu_items')
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .eq('tenant_id', tenant.id)
    : Promise.resolve({ data: null, error: null })

  const [catsResult, itemsResult, bundleResult, outletsResult, overridesResult] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    // Deliberately unfiltered on `is_available`: an out-of-stock dish stays on
    // the menu, marked unavailable by the card template, rather than vanishing.
    // The bundle-slot query below still filters, because a slot *offers* a dish
    // rather than listing it. See src/lib/menu-item-availability.ts.
    supabase.from('menu_items').select(MENU_ITEM_LIST_SELECT).eq('tenant_id', tenant.id).order('order'),
    bundlesQuery,
    outletsQuery,
    overridesQuery,
  ])

  // A branch query failure must not blank the menu — throwing here is the
  // regression 38b4ede fixed for the dish query. But it must not silently fall
  // back to single-location behaviour either: that renders the one-outlet flow
  // for a multi-branch merchant and sends the order to the wrong kitchen, which
  // is what Phase 1's Decision E exists to prevent.
  //
  // So the failure is carried rather than swallowed. The menu still renders;
  // `resolveOutletAvailability` turns this flag into a block on *ordering*.
  const outletsFailed = Boolean(outletsResult?.error)
  if (outletsFailed) {
    console.warn('[menu-server] Outlet query failed:', outletsResult?.error?.message)
  }
  const outlets = (outletsResult?.data as unknown as Outlet[] | null) ?? []

  // Carried for the same reason, one step further in. An empty override set is
  // not "no data" — it is the claim that every branch sells at the store-wide
  // price, which after a failed query would quote one branch's customers
  // another branch's prices. The menu still renders; ordering is what stops.
  const overridesFailed = Boolean(overridesResult?.error)
  if (overridesFailed) {
    console.warn('[menu-server] Branch menu query failed:', overridesResult?.error?.message)
  }
  const menuOverrides = (overridesResult?.data as unknown as OutletMenuOverride[] | null) ?? []

  // Check if the current user is an admin for this tenant (server-side)
  let isBrandAdmin = false
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: role } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      const currentRole = role as { role: string; tenant_id: string | null } | null
      isBrandAdmin = !!currentRole && (
        currentRole.role === 'superadmin' ||
        (currentRole.role === 'admin' && currentRole.tenant_id === tenant.id)
      )
    }
  } catch {
    // Silently ignore auth errors — default to non-admin
  }

  if (catsResult.error || itemsResult.error) {
    const details = [
      catsResult.error?.message && `categories: ${catsResult.error.message}`,
      itemsResult.error?.message && `items: ${itemsResult.error.message}`,
    ].filter(Boolean).join('; ')
    return { tenant, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], outlets: [] as Outlet[], outletsFailed: false, menuOverrides: [] as OutletMenuOverride[], overridesFailed: false, isBrandAdmin, error: `Failed to load menu data (${details})` }
  }

  // Bundle query errors are non-fatal — menu items should still show
  if (bundleResult.error) {
    console.warn('[menu-server] Bundle query failed (migration may not be applied yet):', bundleResult.error.message)
  }

  const bundlesData = (bundleResult.data as unknown as BundleWithSlots[] | null) ?? []

  // Populate each slot's items — filter by included_item_ids when set
  if (bundlesData.length > 0) {
    for (const bundle of bundlesData) {
      for (const slot of bundle.slots ?? []) {
        let query = supabase
          .from('menu_items')
          .select('*')
          .eq('category_id', slot.category_id)
          .eq('tenant_id', tenant.id)
          .eq('is_available', true)
          .order('order', { ascending: true })
        if (slot.included_item_ids && slot.included_item_ids.length > 0) {
          query = query.in('id', slot.included_item_ids)
        }
        const { data: slotItems } = await query
        slot.items = (slotItems as unknown as MenuItem[]) ?? []
      }
    }
  }

  // Filter out bundles with no valid slots
  const bundles = bundlesData.filter((b) => (b.slots ?? []).length > 0)

  return {
    tenant,
    categories: (catsResult.data as unknown as Category[]) || [],
    menuItems: (itemsResult.data as unknown as MenuItem[]) || [],
    bundles,
    outlets,
    outletsFailed,
    menuOverrides,
    overridesFailed,
    isBrandAdmin,
    error: null
  }
}
