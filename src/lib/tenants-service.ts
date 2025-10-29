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
  // Extended branding colors
  background_color: z.string().optional().or(z.literal('')).optional(),
  header_color: z.string().optional().or(z.literal('')).optional(),
  header_font_color: z.string().optional().or(z.literal('')).optional(),
  cards_color: z.string().optional().or(z.literal('')).optional(),
  cards_border_color: z.string().optional().or(z.literal('')).optional(),
  button_primary_color: z.string().optional().or(z.literal('')).optional(),
  button_primary_text_color: z.string().optional().or(z.literal('')).optional(),
  button_secondary_color: z.string().optional().or(z.literal('')).optional(),
  button_secondary_text_color: z.string().optional().or(z.literal('')).optional(),
  text_primary_color: z.string().optional().or(z.literal('')).optional(),
  text_secondary_color: z.string().optional().or(z.literal('')).optional(),
  text_muted_color: z.string().optional().or(z.literal('')).optional(),
  border_color: z.string().optional().or(z.literal('')).optional(),
  success_color: z.string().optional().or(z.literal('')).optional(),
  warning_color: z.string().optional().or(z.literal('')).optional(),
  error_color: z.string().optional().or(z.literal('')).optional(),
  link_color: z.string().optional().or(z.literal('')).optional(),
  shadow_color: z.string().optional().or(z.literal('')).optional(),
  // Menu hero customization
  hero_title: z.string().optional().or(z.literal('')).optional(),
  hero_description: z.string().optional().or(z.literal('')).optional(),
  hero_title_color: z.string().optional().or(z.literal('')).optional(),
  hero_description_color: z.string().optional().or(z.literal('')).optional(),
  messenger_page_id: z.string().min(1),
  messenger_username: z.string().optional().or(z.literal('')).optional(),
  is_active: z.boolean().default(true),
  mapbox_enabled: z.boolean().default(true),
  enable_order_management: z.boolean().default(true),
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
    // Extended branding colors
    background_color: parsed.background_color ?? undefined,
    header_color: parsed.header_color ?? undefined,
    header_font_color: parsed.header_font_color ?? undefined,
    cards_color: parsed.cards_color ?? undefined,
    cards_border_color: parsed.cards_border_color ?? undefined,
    button_primary_color: parsed.button_primary_color ?? undefined,
    button_primary_text_color: parsed.button_primary_text_color ?? undefined,
    button_secondary_color: parsed.button_secondary_color ?? undefined,
    button_secondary_text_color: parsed.button_secondary_text_color ?? undefined,
    text_primary_color: parsed.text_primary_color ?? undefined,
    text_secondary_color: parsed.text_secondary_color ?? undefined,
    text_muted_color: parsed.text_muted_color ?? undefined,
    border_color: parsed.border_color ?? undefined,
    success_color: parsed.success_color ?? undefined,
    warning_color: parsed.warning_color ?? undefined,
    error_color: parsed.error_color ?? undefined,
    link_color: parsed.link_color ?? undefined,
    shadow_color: parsed.shadow_color ?? undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username ?? undefined,
    is_active: parsed.is_active,
    mapbox_enabled: parsed.mapbox_enabled,
    enable_order_management: parsed.enable_order_management,
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
    // Extended branding colors
    background_color: parsed.background_color ?? undefined,
    header_color: parsed.header_color ?? undefined,
    header_font_color: parsed.header_font_color ?? undefined,
    cards_color: parsed.cards_color ?? undefined,
    cards_border_color: parsed.cards_border_color ?? undefined,
    button_primary_color: parsed.button_primary_color ?? undefined,
    button_primary_text_color: parsed.button_primary_text_color ?? undefined,
    button_secondary_color: parsed.button_secondary_color ?? undefined,
    button_secondary_text_color: parsed.button_secondary_text_color ?? undefined,
    text_primary_color: parsed.text_primary_color ?? undefined,
    text_secondary_color: parsed.text_secondary_color ?? undefined,
    text_muted_color: parsed.text_muted_color ?? undefined,
    border_color: parsed.border_color ?? undefined,
    success_color: parsed.success_color ?? undefined,
    warning_color: parsed.warning_color ?? undefined,
    error_color: parsed.error_color ?? undefined,
    link_color: parsed.link_color ?? undefined,
    shadow_color: parsed.shadow_color ?? undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username ?? undefined,
    is_active: parsed.is_active,
    mapbox_enabled: parsed.mapbox_enabled,
    enable_order_management: parsed.enable_order_management,
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


