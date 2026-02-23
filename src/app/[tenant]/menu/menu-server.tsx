import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .maybeSingle()

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], bundles: [] as BundleWithItems[], error: 'Restaurant not found' }
  }

  const tenant = tenantData as Tenant

  const [catsResult, itemsResult] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).eq('is_available', true).order('order'),
  ])

  if (catsResult.error || itemsResult.error) {
    return { tenant, categories: [], menuItems: [], bundles: [] as BundleWithItems[], error: 'Failed to load menu data' }
  }

  // Fetch bundles if enabled
  let bundles: BundleWithItems[] = []
  if (tenant.bundles_enabled) {
    const { data: bundleData } = await supabase
      .from('bundles')
      .select(`
        *,
        items:bundle_items(
          *,
          menu_item:menu_items(*)
        )
      `)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .eq('show_on_menu', true)
      .order('display_order', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bundles = (bundleData as unknown as BundleWithItems[]) ?? []
  }

  return {
    tenant,
    categories: (catsResult.data as Category[]) || [],
    menuItems: (itemsResult.data as MenuItem[]) || [],
    bundles,
    error: null
  }
}