/**
 * React Cache implementation for server-side data caching
 * Reduces duplicate queries across the same request
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category } from '@/types/database'

/**
 * Lightweight menu item type for list views
 * Excludes large JSONB fields (variations, variation_types, addons)
 * Reduces payload from ~200KB to ~30KB for 100 items (85% reduction)
 */
export interface MenuItemListItem {
  id: string
  tenant_id: string
  category_id: string
  name: string
  description: string
  price: number
  discounted_price?: number
  image_url: string
  is_available: boolean
  is_featured?: boolean
  order: number
  created_at: string
}

/**
 * Cache tenant by slug
 * Prevents duplicate queries when getTenantBySlug is called multiple times
 */
export const getCachedTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  
  return data as Tenant
})

/**
 * Cache tenant by ID
 */
export const getCachedTenantById = cache(async (id: string): Promise<Tenant | null> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  
  return data as Tenant
})

/**
 * Cache categories by tenant
 */
export const getCachedCategoriesByTenant = cache(async (tenantId: string): Promise<Category[]> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (error) throw error
  return data as Category[]
})

/**
 * Cache current user role
 */
export const getCachedCurrentUserRole = cache(async () => {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return null
  }

  const { data: userRole } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return userRole
})

/**
 * Preload tenant data for faster subsequent access
 */
export function preloadTenant(slug: string) {
  void getCachedTenantBySlug(slug)
}

/**
 * Preload categories for faster access
 */
export function preloadCategories(tenantId: string) {
  void getCachedCategoriesByTenant(tenantId)
}

/**
 * Cache menu items list for tenant (optimized for list views)
 * Only fetches essential columns, excluding large JSONB fields
 * Use this for grid/list views where variations/addons are not needed
 */
export const getCachedMenuItemsList = cache(async (tenantId: string): Promise<MenuItemListItem[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      tenant_id,
      category_id,
      name,
      description,
      price,
      discounted_price,
      image_url,
      is_available,
      is_featured,
      order,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (error) throw error
  return data as MenuItemListItem[]
})

/**
 * Cache menu items list for tenant (optimized for list views)
 * Only fetches essential columns, excluding large JSONB fields
 * Use this for grid/list views where variations/addons are not needed
 */
export function preloadMenuItemsList(tenantId: string) {
  void getCachedMenuItemsList(tenantId)
}

