'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tenantSchema, type TenantInput } from '@/lib/tenants-service'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { verifyTenantAdmin } from '@/lib/admin-service'

type TenantsInsert = Database['public']['Tables']['tenants']['Insert']
type TenantsUpdate = Database['public']['Tables']['tenants']['Update']

export async function createTenantAction(input: TenantInput) {
  try {
    const supabase = await createClient()
    
    // Validate input
    let parsed
    try {
      parsed = tenantSchema.parse(input)
    } catch (error) {
      if (error instanceof Error) {
        return { error: `Validation error: ${error.message}` }
      }
      return { error: 'Invalid input data' }
    }
    
    // Check if slug is taken
    const { data: existing, error: checkError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', parsed.slug)
      .maybeSingle()
    
    if (checkError) {
      return { error: `Database error: ${checkError.message}` }
    }
    
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
    // Extended branding colors
    background_color: parsed.background_color || undefined,
    header_color: parsed.header_color || undefined,
    header_font_color: parsed.header_font_color || undefined,
    cards_color: parsed.cards_color || undefined,
    cards_border_color: parsed.cards_border_color || undefined,
    card_title_color: parsed.card_title_color || undefined,
    card_price_color: parsed.card_price_color || undefined,
    card_description_color: parsed.card_description_color || undefined,
    modal_background_color: parsed.modal_background_color || undefined,
    modal_title_color: parsed.modal_title_color || undefined,
    modal_price_color: parsed.modal_price_color || undefined,
    modal_description_color: parsed.modal_description_color || undefined,
    button_primary_color: parsed.button_primary_color || undefined,
    button_primary_text_color: parsed.button_primary_text_color || undefined,
    button_secondary_color: parsed.button_secondary_color || undefined,
    button_secondary_text_color: parsed.button_secondary_text_color || undefined,
    text_primary_color: parsed.text_primary_color || undefined,
    text_secondary_color: parsed.text_secondary_color || undefined,
    text_muted_color: parsed.text_muted_color || undefined,
    border_color: parsed.border_color || undefined,
    success_color: parsed.success_color || undefined,
    warning_color: parsed.warning_color || undefined,
    error_color: parsed.error_color || undefined,
    link_color: parsed.link_color || undefined,
    shadow_color: parsed.shadow_color || undefined,
    // Menu hero customization
    hero_title: parsed.hero_title || undefined,
    hero_description: parsed.hero_description || undefined,
    hero_title_color: parsed.hero_title_color || undefined,
    hero_description_color: parsed.hero_description_color || undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username || undefined,
    is_active: parsed.is_active,
    mapbox_enabled: parsed.mapbox_enabled,
    enable_order_management: parsed.enable_order_management,
    // Restaurant address
    restaurant_address: parsed.restaurant_address || undefined,
    restaurant_latitude: parsed.restaurant_latitude || undefined,
    restaurant_longitude: parsed.restaurant_longitude || undefined,
    // Lalamove configuration
    lalamove_enabled: parsed.lalamove_enabled,
    lalamove_api_key: parsed.lalamove_api_key || undefined,
    lalamove_secret_key: parsed.lalamove_secret_key || undefined,
    lalamove_market: parsed.lalamove_market || undefined,
    lalamove_service_type: parsed.lalamove_service_type || undefined,
    lalamove_sandbox: parsed.lalamove_sandbox,
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
    
    if (!data) {
      return { error: 'Failed to create tenant: No data returned' }
    }
    
    // Revalidate cached data
    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = data as any
    
    // Redirect to the new tenant's menu
    // Note: redirect() throws a NEXT_REDIRECT error that Next.js handles
    redirect(`/${tenant.slug}/menu`)
  } catch (error) {
    // Check if this is a redirect error - if so, re-throw it
    if (error && typeof error === 'object' && 'digest' in error) {
      // This is a NEXT_REDIRECT error - let it propagate
      throw error
    }
    
    console.error('Error creating tenant:', error)
    return { 
      error: error instanceof Error ? error.message : 'An unexpected error occurred while creating the tenant' 
    }
  }
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
    // Extended branding colors
    background_color: parsed.background_color || undefined,
    header_color: parsed.header_color || undefined,
    header_font_color: parsed.header_font_color || undefined,
    cards_color: parsed.cards_color || undefined,
    cards_border_color: parsed.cards_border_color || undefined,
    card_title_color: parsed.card_title_color || undefined,
    card_price_color: parsed.card_price_color || undefined,
    card_description_color: parsed.card_description_color || undefined,
    modal_background_color: parsed.modal_background_color || undefined,
    modal_title_color: parsed.modal_title_color || undefined,
    modal_price_color: parsed.modal_price_color || undefined,
    modal_description_color: parsed.modal_description_color || undefined,
    button_primary_color: parsed.button_primary_color || undefined,
    button_primary_text_color: parsed.button_primary_text_color || undefined,
    button_secondary_color: parsed.button_secondary_color || undefined,
    button_secondary_text_color: parsed.button_secondary_text_color || undefined,
    text_primary_color: parsed.text_primary_color || undefined,
    text_secondary_color: parsed.text_secondary_color || undefined,
    text_muted_color: parsed.text_muted_color || undefined,
    border_color: parsed.border_color || undefined,
    success_color: parsed.success_color || undefined,
    warning_color: parsed.warning_color || undefined,
    error_color: parsed.error_color || undefined,
    link_color: parsed.link_color || undefined,
    shadow_color: parsed.shadow_color || undefined,
    // Menu hero customization
    hero_title: parsed.hero_title || undefined,
    hero_description: parsed.hero_description || undefined,
    hero_title_color: parsed.hero_title_color || undefined,
    hero_description_color: parsed.hero_description_color || undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username || undefined,
    is_active: parsed.is_active,
    mapbox_enabled: parsed.mapbox_enabled,
    enable_order_management: parsed.enable_order_management,
    // Restaurant address
    restaurant_address: parsed.restaurant_address || undefined,
    restaurant_latitude: parsed.restaurant_latitude || undefined,
    restaurant_longitude: parsed.restaurant_longitude || undefined,
    // Lalamove configuration
    lalamove_enabled: parsed.lalamove_enabled,
    lalamove_api_key: parsed.lalamove_api_key || undefined,
    lalamove_secret_key: parsed.lalamove_secret_key || undefined,
    lalamove_market: parsed.lalamove_market || undefined,
    lalamove_service_type: parsed.lalamove_service_type || undefined,
    lalamove_sandbox: parsed.lalamove_sandbox,
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

// Allow tenant admins to update only branding-related fields for their own tenant
const brandingUpdateSchema = z.object({
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  accent_color: z.string().optional().or(z.literal('')).optional(),
  background_color: z.string().optional().or(z.literal('')).optional(),
  header_color: z.string().optional().or(z.literal('')).optional(),
  header_font_color: z.string().optional().or(z.literal('')).optional(),
  cards_color: z.string().optional().or(z.literal('')).optional(),
  cards_border_color: z.string().optional().or(z.literal('')).optional(),
  card_title_color: z.string().optional().or(z.literal('')).optional(),
  card_price_color: z.string().optional().or(z.literal('')).optional(),
  card_description_color: z.string().optional().or(z.literal('')).optional(),
  modal_background_color: z.string().optional().or(z.literal('')).optional(),
  modal_title_color: z.string().optional().or(z.literal('')).optional(),
  modal_price_color: z.string().optional().or(z.literal('')).optional(),
  modal_description_color: z.string().optional().or(z.literal('')).optional(),
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
  messenger_page_access_token: z.string().optional().or(z.literal('')).optional(),
})

export type BrandingUpdateInput = z.infer<typeof brandingUpdateSchema>

export async function updateTenantBrandingForAdminAction(tenantId: string, input: BrandingUpdateInput) {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  const parsed = brandingUpdateSchema.parse(input)

  const query = supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints if local types differ
    .update(parsed as unknown as never)
    .eq('id', tenantId)
    .select('id, slug')
    .single()

  const { data, error } = await query

  if (error) {
    return { error: error.message }
  }

  // Revalidate relevant paths (settings and public menu for theme)
  revalidatePath(`/superadmin/tenants/${tenantId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = data as any
  if (updated?.slug) {
    revalidatePath(`/${updated.slug}/admin/settings`)
    revalidatePath(`/${updated.slug}/menu`)
  }

  return { success: true }
}

