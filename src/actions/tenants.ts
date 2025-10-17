'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tenantSchema, type TenantInput } from '@/lib/tenants-service'
import type { Database } from '@/types/database'

type TenantsInsert = Database['public']['Tables']['tenants']['Insert']
type TenantsUpdate = Database['public']['Tables']['tenants']['Update']

export async function createTenantAction(input: TenantInput) {
  const supabase = await createClient()
  
  // Validate input
  const parsed = tenantSchema.parse(input)
  
  // Check if slug is taken
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', parsed.slug)
    .maybeSingle()
  
  if (existing) {
    return { error: 'Slug is already taken' }
  }
  
  const insertPayload: TenantsInsert = {
    name: parsed.name,
    slug: parsed.slug,
    domain: parsed.domain || undefined,
    logo_url: parsed.logo_url || '',
    primary_color: parsed.primary_color,
    secondary_color: parsed.secondary_color,
    accent_color: parsed.accent_color || undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username || undefined,
    is_active: parsed.is_active,
  }
  
  const query = supabase
    .from('tenants')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
    .select('*')
    .single()
  
  const { data, error } = await query
  
  if (error) {
    return { error: error.message }
  }
  
  // Revalidate cached data
  revalidatePath('/superadmin')
  revalidatePath('/superadmin/tenants')
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = data as any
  
  // Redirect to the new tenant's menu
  redirect(`/${tenant.slug}/menu`)
}

export async function updateTenantAction(id: string, input: TenantInput) {
  const supabase = await createClient()
  
  // Validate input
  const parsed = tenantSchema.parse({ ...input, id })
  
  // Check if slug is taken by another tenant
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', parsed.slug)
    .neq('id', id)
    .maybeSingle()
  
  if (existing) {
    return { error: 'Slug is already taken' }
  }
  
  const updatePayload: TenantsUpdate = {
    name: parsed.name,
    slug: parsed.slug,
    domain: parsed.domain || undefined,
    logo_url: parsed.logo_url || '',
    primary_color: parsed.primary_color,
    secondary_color: parsed.secondary_color,
    accent_color: parsed.accent_color || undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username || undefined,
    is_active: parsed.is_active,
  }
  
  const query = supabase
    .from('tenants')
    // @ts-expect-error - Supabase type inference issue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updatePayload as any)
    .eq('id', id)
    .select('*')
    .single()
  
  const { data, error } = await query
  
  if (error) {
    return { error: error.message }
  }
  
  // Revalidate cached data
  revalidatePath('/superadmin')
  revalidatePath('/superadmin/tenants')
  revalidatePath(`/superadmin/tenants/${id}`)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { success: true, data: data as any }
}

