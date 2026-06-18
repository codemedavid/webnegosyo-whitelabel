'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tenantSchema, type TenantInput } from '@/lib/tenants-service'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { normalizeOperatingHours, type OperatingHours } from '@/lib/operating-hours'
import { convertToTenant } from '@/lib/leads/leads-service'

type TenantsInsert = Database['public']['Tables']['tenants']['Insert']
type TenantsUpdate = Database['public']['Tables']['tenants']['Update']

// Distance-based delivery columns. Generated Supabase types lag the migration, so we widen
// the insert/update payloads locally (same approach as src/lib/tenants-service.ts).
type DeliveryFeeColumns = {
  distance_delivery_enabled?: boolean
  delivery_price_per_km?: number | null
  delivery_min_fee?: number | null
  delivery_radius_km?: number | null
}

/**
 * Verify the current user is a superadmin
 * Throws an error if not authenticated or not a superadmin
 */
async function verifySuperadmin() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  const { data: userRole, error: roleError } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = userRole as { role: string } | null
  if (roleError || !role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }

  return { user, supabase }
}

export async function createTenantAction(input: TenantInput, leadId?: string) {
  try {
    // Verify superadmin access before proceeding
    const { supabase } = await verifySuperadmin()

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

    const insertPayload: TenantsInsert & DeliveryFeeColumns = {
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
      // Menu engineering
      menu_engineering_enabled: parsed.menu_engineering_enabled,
      hide_currency_symbol: parsed.hide_currency_symbol,
      checkout_upsell_enabled: parsed.checkout_upsell_enabled,
      bundles_enabled: parsed.bundles_enabled,
      pairing_rules_enabled: parsed.pairing_rules_enabled,
      qr_handoff_enabled: parsed.qr_handoff_enabled ?? false,
      // Flash screen
      flash_screen_feature_enabled: parsed.flash_screen_feature_enabled ?? false,
      flash_screen_is_active: parsed.flash_screen_is_active ?? undefined,
      flash_screen_title: parsed.flash_screen_title || undefined,
      flash_screen_subtitle: parsed.flash_screen_subtitle || undefined,
      flash_screen_image_url: parsed.flash_screen_image_url || undefined,
      flash_screen_background_color: parsed.flash_screen_background_color || undefined,
      flash_screen_text_color: parsed.flash_screen_text_color || undefined,
      flash_screen_duration_ms: parsed.flash_screen_duration_ms ?? undefined,
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
      lalamove_sender_phone: parsed.lalamove_sender_phone || undefined,
      // Distance-based delivery fee
      distance_delivery_enabled: parsed.distance_delivery_enabled,
      delivery_price_per_km: parsed.delivery_price_per_km ?? undefined,
      delivery_min_fee: parsed.delivery_min_fee ?? undefined,
      delivery_radius_km: parsed.delivery_radius_km ?? undefined,
      // Convex / Mobile App
      convex_deployment_url: parsed.convex_deployment_url || undefined,
      convex_deploy_key: parsed.convex_deploy_key || undefined,
      // Email notifications
      admin_email: parsed.admin_email || null,
      email_notifications_enabled: parsed.email_notifications_enabled,
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

    // If this creation came from a lead conversion, mark the lead as converted
    if (leadId) {
      await convertToTenant(leadId, tenant.id)
    }

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
  // Verify superadmin access before proceeding
  const { supabase } = await verifySuperadmin()

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

  const updatePayload: TenantsUpdate & DeliveryFeeColumns = {
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
    // Menu engineering
    menu_engineering_enabled: parsed.menu_engineering_enabled,
    hide_currency_symbol: parsed.hide_currency_symbol,
    checkout_upsell_enabled: parsed.checkout_upsell_enabled,
    bundles_enabled: parsed.bundles_enabled,
    pairing_rules_enabled: parsed.pairing_rules_enabled,
    qr_handoff_enabled: parsed.qr_handoff_enabled ?? false,
    // Flash screen
    flash_screen_feature_enabled: parsed.flash_screen_feature_enabled ?? undefined,
    flash_screen_is_active: parsed.flash_screen_is_active ?? undefined,
    flash_screen_title: parsed.flash_screen_title || undefined,
    flash_screen_subtitle: parsed.flash_screen_subtitle || undefined,
    flash_screen_image_url: parsed.flash_screen_image_url || undefined,
    flash_screen_background_color: parsed.flash_screen_background_color || undefined,
    flash_screen_text_color: parsed.flash_screen_text_color || undefined,
    flash_screen_duration_ms: parsed.flash_screen_duration_ms ?? undefined,
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
    lalamove_sender_phone: parsed.lalamove_sender_phone || undefined,
    // Distance-based delivery fee
    distance_delivery_enabled: parsed.distance_delivery_enabled,
    delivery_price_per_km: parsed.delivery_price_per_km ?? undefined,
    delivery_min_fee: parsed.delivery_min_fee ?? undefined,
    delivery_radius_km: parsed.delivery_radius_km ?? undefined,
    // Convex / Mobile App
    convex_deployment_url: parsed.convex_deployment_url || undefined,
    convex_deploy_key: parsed.convex_deploy_key || undefined,
    // Email notifications
    admin_email: parsed.admin_email || null,
    email_notifications_enabled: parsed.email_notifications_enabled,
  }

  const query = supabase
    .from('tenants')
    .update(updatePayload)
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

// Allow tenant admins to update distance-based delivery + store-location fields for their own tenant
const deliveryUpdateSchema = z.object({
  distance_delivery_enabled: z.boolean(),
  delivery_price_per_km: z.number().min(0).nullable(),
  delivery_min_fee: z.number().min(0).nullable(),
  delivery_radius_km: z.number().positive().nullable(),
  restaurant_address: z.string().optional().or(z.literal('')),
  restaurant_latitude: z.number().nullable(),
  restaurant_longitude: z.number().nullable(),
}).superRefine((val, ctx) => {
  // When the feature is ON it must be fully configured, otherwise it silently fails open
  // (no fee + no radius enforcement at checkout). Require pricing + store location.
  if (!val.distance_delivery_enabled) return
  if (val.delivery_price_per_km == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delivery_price_per_km'], message: 'Price per km is required when distance-based delivery is enabled' })
  }
  if (val.delivery_min_fee == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delivery_min_fee'], message: 'Minimum fee is required when distance-based delivery is enabled' })
  }
  if (val.delivery_radius_km == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delivery_radius_km'], message: 'Delivery radius is required when distance-based delivery is enabled' })
  }
  if (val.restaurant_latitude == null || val.restaurant_longitude == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['restaurant_latitude'], message: 'Store location is required when distance-based delivery is enabled' })
  }
})

export type DeliveryUpdateInput = z.infer<typeof deliveryUpdateSchema>

export async function updateTenantDeliveryForAdminAction(tenantId: string, input: DeliveryUpdateInput) {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  const result = deliveryUpdateSchema.safeParse(input)
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? 'Invalid delivery settings' }
  }
  const parsed = result.data

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = data as any
  const slug = updated?.slug as string | undefined
  if (slug) {
    revalidatePath(`/${slug}/admin/settings`)
    revalidatePath(`/${slug}/menu`)
  }

  return { success: true }
}

// Allow tenant admins to update only footer-related fields for their own tenant
export interface FooterUpdateInput {
  footer_enabled?: boolean
  footer_theme?: string
  footer_logo_url?: string
  footer_business_name?: string
  footer_tagline?: string
  footer_address?: string
  footer_phone?: string
  footer_whatsapp?: string
  footer_viber?: string
  footer_email?: string
  footer_facebook_url?: string
  footer_instagram_url?: string
  footer_tiktok_url?: string
  footer_twitter_url?: string
  footer_youtube_url?: string
  footer_facebook_name?: string
  footer_instagram_name?: string
  footer_tiktok_name?: string
  footer_twitter_name?: string
  footer_youtube_name?: string
  footer_about_us?: string
  footer_terms_of_service?: string
  footer_refund_policy?: string
  footer_privacy_policy?: string
  footer_copyright_text?: string
  footer_show_powered_by?: boolean
  footer_powered_by_text?: string
  footer_background_color?: string
  footer_text_color?: string
  footer_heading_color?: string
  footer_link_color?: string
  footer_muted_color?: string
  footer_icon_color?: string
  footer_icon_background_color?: string
  footer_border_color?: string
}

const footerUpdateSchema = z.object({
  footer_enabled: z.boolean().optional(),
  footer_theme: z.enum(['auto', 'light', 'dark', 'brand', 'midnight', 'minimal', 'custom']).optional(),
  footer_logo_url: z.string().optional(),
  footer_business_name: z.string().optional(),
  footer_tagline: z.string().optional(),
  footer_address: z.string().optional(),
  footer_phone: z.string().optional(),
  footer_whatsapp: z.string().optional(),
  footer_viber: z.string().optional(),
  footer_email: z.string().optional(),
  footer_facebook_url: z.string().optional(),
  footer_instagram_url: z.string().optional(),
  footer_tiktok_url: z.string().optional(),
  footer_twitter_url: z.string().optional(),
  footer_youtube_url: z.string().optional(),
  footer_facebook_name: z.string().optional(),
  footer_instagram_name: z.string().optional(),
  footer_tiktok_name: z.string().optional(),
  footer_twitter_name: z.string().optional(),
  footer_youtube_name: z.string().optional(),
  footer_about_us: z.string().optional(),
  footer_terms_of_service: z.string().optional(),
  footer_refund_policy: z.string().optional(),
  footer_privacy_policy: z.string().optional(),
  footer_copyright_text: z.string().optional(),
  footer_show_powered_by: z.boolean().optional(),
  footer_powered_by_text: z.string().optional(),
  footer_background_color: z.string().optional(),
  footer_text_color: z.string().optional(),
  footer_heading_color: z.string().optional(),
  footer_link_color: z.string().optional(),
  footer_muted_color: z.string().optional(),
  footer_icon_color: z.string().optional(),
  footer_icon_background_color: z.string().optional(),
  footer_border_color: z.string().optional(),
})

export async function updateTenantFooterForAdminAction(
  tenantId: string,
  input: FooterUpdateInput
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  const parsed = footerUpdateSchema.parse(input)

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

  // Revalidate relevant paths (settings, public menu, storefront, and content pages)
  revalidatePath(`/superadmin/tenants/${tenantId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = data as any
  if (updated?.slug) {
    revalidatePath(`/${updated.slug}/admin/settings`)
    revalidatePath(`/${updated.slug}/menu`)
    revalidatePath(`/${updated.slug}`)
    revalidatePath(`/${updated.slug}/about`)
    revalidatePath(`/${updated.slug}/terms`)
    revalidatePath(`/${updated.slug}/refund`)
    revalidatePath(`/${updated.slug}/privacy`)
  }

  return { success: true }
}

const flashScreenUpdateSchema = z.object({
  flash_screen_is_active: z.boolean().default(false),
  flash_screen_title: z.string().max(120).optional().or(z.literal('')).optional(),
  flash_screen_subtitle: z.string().max(240).optional().or(z.literal('')).optional(),
  flash_screen_image_url: z.string().url().optional().or(z.literal('')).optional(),
  flash_screen_background_color: z.string().optional().or(z.literal('')).optional(),
  flash_screen_text_color: z.string().optional().or(z.literal('')).optional(),
  flash_screen_duration_ms: z.number().int().min(500).max(15000),
})

export type FlashScreenUpdateInput = z.infer<typeof flashScreenUpdateSchema>

/**
 * Allow tenant admins to manage their flash screen settings when feature is enabled by superadmin.
 */
export async function updateTenantFlashScreenForAdminAction(
  tenantId: string,
  input: FlashScreenUpdateInput
) {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, flash_screen_feature_enabled')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenantData) {
    return { error: tenantError?.message || 'Tenant not found' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = tenantData as any
  if (!tenant.flash_screen_feature_enabled) {
    return { error: 'Flash screen feature is not enabled for this tenant.' }
  }

  const parsed = flashScreenUpdateSchema.parse(input)

  const { error } = await supabase
    .from('tenants')
    .update({
      flash_screen_is_active: parsed.flash_screen_is_active,
      flash_screen_title: parsed.flash_screen_title || null,
      flash_screen_subtitle: parsed.flash_screen_subtitle || null,
      flash_screen_image_url: parsed.flash_screen_image_url || null,
      flash_screen_background_color: parsed.flash_screen_background_color || null,
      flash_screen_text_color: parsed.flash_screen_text_color || null,
      flash_screen_duration_ms: parsed.flash_screen_duration_ms,
      // Cast through unknown to satisfy strict generic constraints if local types differ
    } as unknown as never)
    .eq('id', tenantId)

  if (error) {
    return { error: error.message }
  }

  // Revalidate relevant paths
  revalidatePath(`/superadmin/tenants/${tenantId}`)
  if (tenant.slug) {
    revalidatePath(`/${tenant.slug}/admin/settings`)
    revalidatePath(`/${tenant.slug}/menu`)
  }

  return { success: true }
}

/**
 * Allow tenant admins to update messenger redirect mode for their own tenant
 */
export async function updateTenantMessengerModeAction(
  tenantId: string,
  mode: 'webhook' | 'direct'
) {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  // Validate mode
  if (mode !== 'webhook' && mode !== 'direct') {
    return { error: 'Invalid mode. Must be "webhook" or "direct".' }
  }

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints if local types differ
    .update({ messenger_redirect_mode: mode } as unknown as never)
    .eq('id', tenantId)
    .select('id, slug')
    .single()

  if (error) {
    return { error: error.message }
  }

  // Revalidate relevant paths
  revalidatePath(`/superadmin/tenants/${tenantId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = data as any
  if (updated?.slug) {
    revalidatePath(`/${updated.slug}/admin/settings`)
  }

  return { success: true, mode }
}

/**
 * Update a tenant's operating hours + timezone. Tenant-admin (or superadmin) only.
 * Operating hours drive advance-order scheduling slot windows; see src/lib/operating-hours.ts.
 * Input is sanitized via normalizeOperatingHours so the stored JSON is always well-formed.
 */
export async function updateOperatingHoursAction(
  tenantId: string,
  operatingHours: OperatingHours | null,
  timezone?: string
) {
  const supabase = await createClient()

  // Verify caller is admin of this tenant (or superadmin)
  await verifyTenantAdmin(tenantId)

  const normalized = normalizeOperatingHours(operatingHours)
  const tz = (timezone || '').trim() || 'Asia/Manila'

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints (columns added via migration).
    .update({ operating_hours: normalized, timezone: tz } as unknown as never)
    .eq('id', tenantId)
    .select('id, slug')
    .single()

  if (error) {
    return { error: error.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = data as any
  if (updated?.slug) {
    revalidatePath(`/${updated.slug}/admin/settings`)
    revalidatePath(`/${updated.slug}/checkout`)
  }

  return { success: true, operating_hours: normalized, timezone: tz }
}

/**
 * Toggle a single tenant's active state. Superadmin-only.
 */
export async function setTenantActiveAction(
  id: string,
  isActive: boolean
): Promise<{ error?: string; success?: boolean }> {
  try {
    const { supabase } = await verifySuperadmin()

    const { error } = await supabase
      .from('tenants')
      // Cast through unknown to satisfy strict generic constraints if local types differ
      .update({ is_active: isActive } as unknown as never)
      .eq('id', id)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')
    revalidatePath(`/superadmin/tenants/${id}`)

    return { success: true }
  } catch (error) {
    console.error('Error setting tenant active state:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to update tenant',
    }
  }
}

/**
 * Bulk toggle active state for many tenants at once. Superadmin-only.
 */
export async function bulkSetTenantsActiveAction(
  ids: string[],
  isActive: boolean
): Promise<{ error?: string; updated?: number }> {
  try {
    const { supabase } = await verifySuperadmin()

    if (!ids.length) {
      return { updated: 0 }
    }

    const { error } = await supabase
      .from('tenants')
      // Cast through unknown to satisfy strict generic constraints if local types differ
      .update({ is_active: isActive } as unknown as never)
      .in('id', ids)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')

    return { updated: ids.length }
  } catch (error) {
    console.error('Error bulk-updating tenant active state:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to update tenants',
    }
  }
}

/**
 * Bulk delete tenants and all associated data. Superadmin-only.
 *
 * Mirrors the cascade in src/app/api/tenants/[id]/route.ts:
 * app_users (+ auth, skipping the current superadmin) -> order_items -> orders
 * -> menu_items -> categories -> tenant, all via the service-role admin client.
 */
export async function bulkDeleteTenantsAction(
  ids: string[]
): Promise<{ error?: string; deleted?: number; failed?: string[] }> {
  try {
    const { user } = await verifySuperadmin()

    if (!ids.length) {
      return { deleted: 0, failed: [] }
    }

    const adminClient = createAdminClient()
    let deleted = 0
    const failed: string[] = []

    for (const tenantId of ids) {
      try {
        // Verify tenant exists
        const { data: tenant, error: fetchError } = await adminClient
          .from('tenants')
          .select('id')
          .eq('id', tenantId)
          .single()

        if (fetchError) {
          // Could not verify the tenant — treat as a failure so the caller
          // knows this id was not processed, rather than silently dropping it.
          console.error(`Error verifying tenant ${tenantId}:`, fetchError)
          failed.push(tenantId)
          continue
        }

        if (!tenant) {
          // Already gone — nothing to delete, not an error.
          continue
        }

        // Delete associated admin users (and their auth accounts)
        const { data: tenantUsers } = await adminClient
          .from('app_users')
          .select('user_id')
          .eq('tenant_id', tenantId)

        if (tenantUsers && tenantUsers.length > 0) {
          for (const appUserRow of tenantUsers) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userId = (appUserRow as any).user_id
            // Don't delete the current superadmin's auth account
            if (userId && userId !== user.id) {
              await adminClient.auth.admin.deleteUser(userId)
            }
          }
          await adminClient.from('app_users').delete().eq('tenant_id', tenantId)
        }

        // Delete related data in FK-safe order
        await adminClient.from('order_items').delete().eq('tenant_id', tenantId)
        await adminClient.from('orders').delete().eq('tenant_id', tenantId)
        await adminClient.from('menu_items').delete().eq('tenant_id', tenantId)
        await adminClient.from('categories').delete().eq('tenant_id', tenantId)

        // Delete the tenant itself
        const { error: deleteError } = await adminClient
          .from('tenants')
          .delete()
          .eq('id', tenantId)

        if (deleteError) {
          console.error(`Error deleting tenant ${tenantId}:`, deleteError)
          failed.push(tenantId)
        } else {
          deleted += 1
        }
      } catch (innerError) {
        console.error(`Error deleting tenant ${tenantId}:`, innerError)
        failed.push(tenantId)
      }
    }

    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')

    return { deleted, failed }
  } catch (error) {
    console.error('Error bulk-deleting tenants:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to delete tenants',
    }
  }
}
