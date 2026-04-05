import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/types/database'

// Server-side data fetching with React cache for deduplication
// This runs on the server and benefits from:
// 1. No client bundle size
// 2. Direct database access (faster)
// 3. Automatic request deduplication
// 4. Can be used in Server Components
// 5. Enhanced caching with longer stale times

const TENANTS_PAGE_SIZE = 20

export const getTenants = cache(async (options?: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ data: Tenant[]; count: number }> => {
  const { search, page = 1, pageSize = TENANTS_PAGE_SIZE } = options ?? {}
  const supabase = await createClient()

  let query = supabase
    .from('tenants')
    .select(
      'id, name, slug, is_active, primary_color, domain, created_at, logo_url, menu_engineering_enabled, bundles_enabled, lalamove_enabled, app_enabled',
      { count: 'exact' }
    )

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Error fetching tenants:', error)
    return { data: [], count: 0 }
  }

  return { data: (data as unknown as Tenant[]) || [], count: count ?? 0 }
})

export const getTenant = cache(async (id: string): Promise<Tenant | null> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  
  if (error) {
    console.error('Error fetching tenant:', error)
    return null
  }
  
  return data as unknown as Tenant | null
})

export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  
  if (error) {
    console.error('Error fetching tenant by slug:', error)
    return null
  }
  
  return data as unknown as Tenant | null
})

// Prefetch function for better performance
export async function prefetchTenant(id: string) {
  // This will be cached by React's cache function
  return getTenant(id)
}

export async function prefetchTenants() {
  // This will be cached by React's cache function
  return getTenants()
}

