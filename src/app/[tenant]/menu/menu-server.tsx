import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem, BundleWithSlots } from '@/types/database'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { fetchActiveTenantBySlug, asTenantQueryClient } from '@/lib/queries/fetch-tenant-by-slug'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { tenant: tenantData, error: tenantError } = await fetchActiveTenantBySlug<Tenant>(
    asTenantQueryClient(supabase),
    tenantSlug,
    TENANT_STOREFRONT_SELECT
  )

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], isBrandAdmin: false, error: 'Restaurant not found' }
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

  const [catsResult, itemsResult, bundleResult] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    supabase.from('menu_items').select('id, tenant_id, category_id, name, description, price, discounted_price, image_url, is_available, is_featured, order, variations, variation_types, addons, bcg_classification, badge_text').eq('tenant_id', tenant.id).eq('is_available', true).order('order'),
    bundlesQuery,
  ])

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
    return { tenant, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], isBrandAdmin, error: `Failed to load menu data (${details})` }
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
    isBrandAdmin,
    error: null
  }
}
