import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem } from '@/types/database'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .maybeSingle()

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], error: 'Restaurant not found' }
  }

  const tenant = tenantData as Tenant

  const [{ data: cats, error: catsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('order'),
    supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).order('order'),
  ])

  if (catsError || itemsError) {
    return { tenant, categories: [], menuItems: [], error: 'Failed to load menu data' }
  }

  return {
    tenant,
    categories: (cats as Category[]) || [],
    menuItems: (items as MenuItem[]) || [],
    error: null
  }
}