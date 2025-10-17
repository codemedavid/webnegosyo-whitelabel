import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/types/database'

// Server-side data fetching with React cache for deduplication
// This runs on the server and benefits from:
// 1. No client bundle size
// 2. Direct database access (faster)
// 3. Automatic request deduplication
// 4. Can be used in Server Components

export const getTenants = cache(async (): Promise<Tenant[]> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching tenants:', error)
    return []
  }
  
  return (data as Tenant[]) || []
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
  
  return data as Tenant | null
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
  
  return data as Tenant | null
})

