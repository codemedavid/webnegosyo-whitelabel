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

export type TenantSort = 'recent' | 'oldest' | 'name' | 'status'
export type TenantStatusFilter = 'all' | 'active' | 'inactive'
export type TenantFeatureFilter = 'all' | 'menu_engineering' | 'bundles' | 'app' | 'lalamove'

const FEATURE_COLUMN: Record<Exclude<TenantFeatureFilter, 'all'>, string> = {
  menu_engineering: 'menu_engineering_enabled',
  bundles: 'bundles_enabled',
  app: 'app_enabled',
  lalamove: 'lalamove_enabled',
}

export const getTenants = cache(async (options?: {
  search?: string
  page?: number
  pageSize?: number
  status?: TenantStatusFilter
  feature?: TenantFeatureFilter
  sort?: TenantSort
}): Promise<{ data: Tenant[]; count: number }> => {
  const {
    search,
    page = 1,
    pageSize = TENANTS_PAGE_SIZE,
    status = 'all',
    feature = 'all',
    sort = 'recent',
  } = options ?? {}
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

  if (status === 'active') {
    query = query.eq('is_active', true)
  } else if (status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (feature !== 'all') {
    query = query.eq(FEATURE_COLUMN[feature], true)
  }

  switch (sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    case 'status':
      query = query
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
      break
    case 'recent':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await query.range(from, to)

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

