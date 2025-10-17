import { z } from 'zod'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import type { PostgrestError } from '@supabase/supabase-js'
import type { Tenant as TenantRow, Database } from '@/types/database'

type TenantsInsert = Database['public']['Tables']['tenants']['Insert']
type TenantsUpdate = Database['public']['Tables']['tenants']['Update']

export const tenantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9\-]+$/),
  domain: z.string().url().optional().or(z.literal('')).optional(),
  logo_url: z.string().url().optional().or(z.literal('')).optional(),
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  accent_color: z.string().optional().or(z.literal('')).optional(),
  messenger_page_id: z.string().min(1),
  messenger_username: z.string().optional().or(z.literal('')).optional(),
  is_active: z.boolean().default(true),
})

export type TenantInput = z.infer<typeof tenantSchema>

export async function getTenantBySlugSupabase(slug: string): Promise<{ data: TenantRow | null; error: PostgrestError | null }> {
  const supabase = createBrowserSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: data as TenantRow | null, error: null }
}

export async function getTenantByIdSupabase(id: string): Promise<{ data: TenantRow | null; error: PostgrestError | null }> {
  const supabase = createBrowserSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: data as TenantRow | null, error: null }
}

export async function listTenantsSupabase(): Promise<{ data: TenantRow[]; error: PostgrestError | null }> {
  const supabase = createBrowserSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })
  return { data: (data as TenantRow[]) || [], error }
}

export async function isSlugTaken(slug: string, excludeId?: string) {
  const supabase = createBrowserSupabase()
  let query = supabase.from('tenants').select('id').eq('slug', slug)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) return true
  return (data || []).length > 0
}

export async function createTenantSupabase(input: TenantInput): Promise<TenantRow> {
  const supabase = createBrowserSupabase()
  const parsed = tenantSchema.parse(input)
  if (await isSlugTaken(parsed.slug)) {
    throw new Error('Slug is already taken')
  }
  const insertPayload: TenantsInsert = {
    name: parsed.name,
    slug: parsed.slug,
    domain: parsed.domain ?? undefined,
    logo_url: parsed.logo_url || '',
    primary_color: parsed.primary_color,
    secondary_color: parsed.secondary_color,
    accent_color: parsed.accent_color ?? undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username ?? undefined,
    is_active: parsed.is_active,
  }
  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints if local types differ
    .insert(insertPayload as unknown as never)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Failed to create tenant')
  return data as TenantRow
}

export async function updateTenantSupabase(id: string, input: TenantInput): Promise<TenantRow> {
  const supabase = createBrowserSupabase()
  const parsed = tenantSchema.parse({ ...input, id })
  if (await isSlugTaken(parsed.slug, id)) {
    throw new Error('Slug is already taken')
  }
  const updatePayload: TenantsUpdate = {
    name: parsed.name,
    slug: parsed.slug,
    domain: parsed.domain ?? undefined,
    logo_url: parsed.logo_url || '',
    primary_color: parsed.primary_color,
    secondary_color: parsed.secondary_color,
    accent_color: parsed.accent_color ?? undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username ?? undefined,
    is_active: parsed.is_active,
  }
  const { data, error } = await supabase
    .from('tenants')
    .update(updatePayload as unknown as never)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Failed to update tenant')
  return data as TenantRow
}


