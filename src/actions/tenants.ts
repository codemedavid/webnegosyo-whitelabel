'use server'

import { revalidatePath } from 'next/cache'
import { detachTenantDomains, type TenantDomainColumns } from '@/lib/domains/detach-tenant-domains'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  tenantSchema,
  refineDistanceDelivery,
  describeTenantValidationError,
  type TenantInput,
} from '@/lib/tenants-service'
import { withNewTenantFeatureDefaults } from '@/lib/new-tenant-feature-defaults'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { normalizeMessengerUsername } from '@/lib/messenger-username'
import { normalizeOperatingHours, type OperatingHours } from '@/lib/operating-hours'
import { convertToTenant } from '@/lib/leads/leads-service'
import { invalidateTenantCache } from '@/lib/cache'
import { orderBackendForSave, type OrderBackendPreference } from '@/lib/order-backend'
import { upsertTenantSecrets, type TenantSecretsPatch } from '@/lib/tenant-secrets'
import { syncTenantConvexConfig, convexConfigSyncWarning } from '@/lib/convex-config-sync'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import type { PlatformPermission } from '@/lib/platform-staff/permissions'
import { superadminOnlyRefusal, superadminOnlyTenantChanges } from '@/lib/platform-staff/tenant-edit-scope'

/**
 * The permission every /admin/settings section write needs — the same key the
 * settings catalog gates those screens on (src/lib/settings/settings-catalog.ts).
 * "Any staff of the store" let a POS-only account repoint messenger_username,
 * delivery fees, hours and the pickup flow. Owners, superadmins and legacy
 * full-access admins pass `hasPermission` unchanged.
 */
const SETTINGS_PERMISSION = 'settings' as const

type TenantsInsert = Database['public']['Tables']['tenants']['Insert']
type TenantsUpdate = Database['public']['Tables']['tenants']['Update']

// The `order_backend` column post-dates the generated Supabase types, so widen
// the payloads locally (same approach as the delivery-fee columns below).
type OrderBackendColumn = { order_backend?: OrderBackendPreference }
// `src/types/supabase.ts` is regenerated from the database and still lags the
// outlet-selection-timing migration, so the column is declared alongside the
// other lagging ones rather than blocking the write on a codegen run.
type OutletTimingColumn = { outlet_selection_timing?: string }

// Distance-based delivery columns. Generated Supabase types lag the migration, so we widen
// the insert/update payloads locally (same approach as src/lib/tenants-service.ts).
type DeliveryFeeColumns = {
  distance_delivery_enabled?: boolean
  delivery_price_per_km?: number | null
  delivery_min_fee?: number | null
  delivery_radius_km?: number | null
}

// Same lag for the Loyverse integration migration (20260821120000).
type LoyverseColumns = {
  loyverse_enabled?: boolean
  loyverse_store_id?: string | null
  loyverse_payment_type_id?: string | null
  loyverse_push_mode?: string
}

/**
 * The credential fields the superadmin form carries. They never touch the
 * `tenants` row: they are upserted into `tenant_secrets` after it is saved.
 * A blank field is `undefined` here, which the upsert skips — so leaving a
 * secret empty on edit keeps the stored value, exactly as the old
 * `|| undefined` column writes did.
 */
function secretsPatchFromForm(parsed: TenantInput): TenantSecretsPatch {
  return {
    lalamove_api_key: parsed.lalamove_api_key || undefined,
    lalamove_secret_key: parsed.lalamove_secret_key || undefined,
    loyverse_access_token: parsed.loyverse_access_token || undefined,
    convex_deploy_key: parsed.convex_deploy_key || undefined,
  }
}

/**
 * Verify the console caller holds `permission` (superadmins always do).
 * Throws an error if not authenticated or not permitted.
 */
async function verifyConsolePermission(permission: PlatformPermission) {
  const { user, appUser } = await requirePlatformPermission(permission)
  return { user, isSuperadmin: appUser.role === 'superadmin' }
}

export async function createTenantAction(input: TenantInput, leadId?: string) {
  try {
    // Verify console access before proceeding. Writes go through the service
    // role: platform staff have no RLS insert on tenants, and the privileged-
    // column trigger refuses anyone but a superadmin session.
    const { isSuperadmin } = await verifyConsolePermission('tenants.create')
    const supabase = createAdminClient()

    // Validate input. A raw ZodError must never leave a server action: the
    // client gets an uncaught-action crash instead of a field to fix.
    const validation = tenantSchema.safeParse(withNewTenantFeatureDefaults(input))
    if (!validation.success) {
      return { error: describeTenantValidationError(validation.error) }
    }
    const parsed = validation.data

    // Where a store's orders go is superadmin-only (tenant-edit-scope.ts).
    const backendChanges = superadminOnlyTenantChanges(null, parsed)
    if (!isSuperadmin && backendChanges.length > 0) {
      return { error: superadminOnlyRefusal(backendChanges) }
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

    const insertPayload: TenantsInsert & DeliveryFeeColumns & OrderBackendColumn & OutletTimingColumn & LoyverseColumns = {
      name: parsed.name,
      slug: parsed.slug,
      // No `domain`: the custom-domain flow (TXT ownership proof) is its only writer.
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
    // Inventory
    assistant_enabled: parsed.assistant_enabled,
    inventory_enabled: parsed.inventory_enabled,
    low_stock_alerts_enabled: parsed.low_stock_alerts_enabled,
    auto_86_enabled: parsed.auto_86_enabled,
    presell_enabled: parsed.presell_enabled,
    multi_branch_enabled: parsed.multi_branch_enabled,
    outlet_selection_timing: parsed.outlet_selection_timing,
    modifier_groups_enabled: parsed.modifier_groups_enabled,
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
      // Lalamove configuration (credentials go to tenant_secrets below)
      lalamove_enabled: parsed.lalamove_enabled,
      lalamove_market: parsed.lalamove_market || undefined,
      lalamove_service_type: parsed.lalamove_service_type || undefined,
      lalamove_sandbox: parsed.lalamove_sandbox,
      lalamove_sender_phone: parsed.lalamove_sender_phone || undefined,
      // Loyverse POS integration (access token goes to tenant_secrets below)
      loyverse_enabled: parsed.loyverse_enabled,
      loyverse_store_id: parsed.loyverse_store_id || undefined,
      loyverse_payment_type_id: parsed.loyverse_payment_type_id || undefined,
      loyverse_push_mode: parsed.loyverse_push_mode,
      // Distance-based delivery fee
      distance_delivery_enabled: parsed.distance_delivery_enabled,
      delivery_price_per_km: parsed.delivery_price_per_km ?? undefined,
      delivery_min_fee: parsed.delivery_min_fee ?? undefined,
      delivery_radius_km: parsed.delivery_radius_km ?? undefined,
      // Convex / Mobile App (deploy key goes to tenant_secrets below)
      convex_deployment_url: parsed.convex_deployment_url || undefined,
      // Keep the routing column in step with the credentials being saved, so a
      // Convex tenant never lands on the column default and reads the wrong DB.
      order_backend: orderBackendForSave(parsed.order_backend, {
        convex_deployment_url: parsed.convex_deployment_url || null,
        convex_deploy_key: parsed.convex_deploy_key || null,
      }),
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = data as any

    // The row exists now, so its credentials can be attached to it.
    try {
      await upsertTenantSecrets(supabase, tenant.id, secretsPatchFromForm(parsed))
    } catch (secretsError) {
      return {
        error: secretsError instanceof Error ? secretsError.message : 'Failed to save tenant secrets',
      }
    }

    // A Convex-backed store reads its Lalamove credentials and pickup address
    // from its own deployment, so the settings just saved have to be pushed
    // there too or the order screen reports "Lalamove not configured".
    await syncTenantConvexConfig(tenant.id)

    // Revalidate cached data
    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')

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
  // Verify console access before proceeding; the write itself goes through the
  // service role (see createTenantAction).
  const { isSuperadmin } = await verifyConsolePermission('tenants.edit')
  const supabase = createAdminClient()

  // Validate input. `parse` threw the ZodError straight out of the action,
  // which Next.js surfaces as an uncaught server-action crash (Sentry:
  // "ZodError: [") — the superadmin saw a broken page rather than the field
  // that needs fixing. Refuse with the same `{ error }` envelope every other
  // action in this file uses.
  const validation = tenantSchema.safeParse({ ...input, id })
  if (!validation.success) {
    return { error: describeTenantValidationError(validation.error) }
  }
  const parsed = validation.data

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

  // The tenant form does not carry the per-tenant Supabase order credentials, so
  // read the current routing state before recomputing the column — otherwise
  // saving an unrelated field would demote a `supabase` tenant to `platform`.
  const { data: currentBackendRow } = await supabase
    .from('tenants')
    .select('order_backend, slug, convex_deployment_url')
    .eq('id', id)
    .maybeSingle()

  // Where a store's orders go is superadmin-only (tenant-edit-scope.ts): a
  // staff save may carry these fields only unchanged.
  const backendChanges = superadminOnlyTenantChanges(currentBackendRow, parsed)
  if (!isSuperadmin && backendChanges.length > 0) {
    return { error: superadminOnlyRefusal(backendChanges) }
  }

  const previousSlug = (currentBackendRow as { slug?: string } | null)?.slug ?? null

  const updatePayload: TenantsUpdate & DeliveryFeeColumns & OrderBackendColumn & OutletTimingColumn & LoyverseColumns = {
    name: parsed.name,
    slug: parsed.slug,
    // No `domain`: the custom-domain flow (TXT ownership proof) is its only writer.
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
    // Inventory
    assistant_enabled: parsed.assistant_enabled,
    inventory_enabled: parsed.inventory_enabled,
    low_stock_alerts_enabled: parsed.low_stock_alerts_enabled,
    auto_86_enabled: parsed.auto_86_enabled,
    presell_enabled: parsed.presell_enabled,
    multi_branch_enabled: parsed.multi_branch_enabled,
    outlet_selection_timing: parsed.outlet_selection_timing,
    modifier_groups_enabled: parsed.modifier_groups_enabled,
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
    // Lalamove configuration (credentials go to tenant_secrets below)
    lalamove_enabled: parsed.lalamove_enabled,
    lalamove_market: parsed.lalamove_market || undefined,
    lalamove_service_type: parsed.lalamove_service_type || undefined,
    lalamove_sandbox: parsed.lalamove_sandbox,
    lalamove_sender_phone: parsed.lalamove_sender_phone || undefined,
    // Loyverse POS integration (access token goes to tenant_secrets below)
    loyverse_enabled: parsed.loyverse_enabled,
    loyverse_store_id: parsed.loyverse_store_id || undefined,
    loyverse_payment_type_id: parsed.loyverse_payment_type_id || undefined,
    loyverse_push_mode: parsed.loyverse_push_mode,
    // Distance-based delivery fee
    distance_delivery_enabled: parsed.distance_delivery_enabled,
    delivery_price_per_km: parsed.delivery_price_per_km ?? undefined,
    delivery_min_fee: parsed.delivery_min_fee ?? undefined,
    delivery_radius_km: parsed.delivery_radius_km ?? undefined,
    // Convex / Mobile App (deploy key goes to tenant_secrets below)
    convex_deployment_url: parsed.convex_deployment_url || undefined,
    order_backend: orderBackendForSave(parsed.order_backend, {
      order_backend: (currentBackendRow as { order_backend?: OrderBackendPreference } | null)
        ?.order_backend,
      convex_deployment_url: parsed.convex_deployment_url || null,
      convex_deploy_key: parsed.convex_deploy_key || null,
    }),
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

  try {
    await upsertTenantSecrets(supabase, id, secretsPatchFromForm(parsed))
  } catch (secretsError) {
    return {
      error: secretsError instanceof Error ? secretsError.message : 'Failed to save tenant secrets',
    }
  }

  // Push the saved settings into the store's own Convex deployment. Without
  // this, Lalamove keys edited here never reach the backend the merchant's
  // order screen books through.
  const convexSync = await syncTenantConvexConfig(id)

  // Revalidate cached data
  // The tenant row is Redis-cached for 30 minutes and is what routes orders and
  // gates features, so without this a saved change appears to do nothing until
  // the TTL expires.
  await invalidateTenantCache(parsed.slug, id, previousSlug)

  revalidatePath('/superadmin')
  revalidatePath('/superadmin/tenants')
  revalidatePath(`/superadmin/tenants/${id}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { success: true, data: data as any, warning: convexConfigSyncWarning(convexSync) }
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

  // Branding is Store Setup work, gated like saveBrandingAction.
  await verifyTenantPermission(tenantId, 'store_setup')

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
  // Free delivery at/above this pre-discount item subtotal; null = off.
  free_delivery_min_order: z.number().positive('Free-delivery minimum must be more than 0').nullable().optional(),
  restaurant_address: z.string().optional().or(z.literal('')),
  restaurant_latitude: z.number().nullable(),
  restaurant_longitude: z.number().nullable(),
}).superRefine(refineDistanceDelivery)

export type DeliveryUpdateInput = z.infer<typeof deliveryUpdateSchema>

export async function updateTenantDeliveryForAdminAction(tenantId: string, input: DeliveryUpdateInput) {
  const supabase = await createClient()

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

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

  // This is where a merchant sets its store location, which is also the
  // Lalamove PICKUP point — so the same push a superadmin save does has to
  // happen here, or a Convex-backed store keeps quoting from the old address.
  const convexSync = await syncTenantConvexConfig(tenantId)

  if (slug) {
    // The storefront quotes against the Redis-cached tenant row; without this
    // a moved store keeps its old pickup coordinates for up to 30 minutes.
    await invalidateTenantCache(slug, tenantId)
    revalidatePath(`/${slug}/admin/settings`)
    revalidatePath(`/${slug}/menu`)
  }

  return { success: true, warning: convexConfigSyncWarning(convexSync) }
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

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

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

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

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
 * Allow tenant admins to set their own Messenger username (the m.me handle the
 * "direct" redirect mode links to). Previously superadmin-only, which left a
 * merchant who switched Facebook pages unable to fix their own checkout handoff.
 *
 * The handle is normalized before it is stored, so a pasted m.me/facebook.com URL
 * never becomes part of the generated link.
 */
export async function updateTenantMessengerUsernameAction(
  tenantId: string,
  username: string
) {
  const supabase = await createClient()

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

  const normalized = normalizeMessengerUsername(username)
  if (username.trim() !== '' && normalized === '') {
    return { error: 'That does not look like a Messenger username or page link.' }
  }

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints if local types differ
    .update({ messenger_username: normalized || null } as unknown as never)
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

  return { success: true, messenger_username: normalized }
}

/**
 * Allow tenant admins to update messenger redirect mode for their own tenant
 */
export async function updateTenantMessengerModeAction(
  tenantId: string,
  mode: 'webhook' | 'direct'
) {
  const supabase = await createClient()

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

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
 * Toggle whether checkout auto-redirects the customer to Messenger after an
 * order is placed. Tenant-admin (or superadmin) only. When disabled, the
 * customer stays on the confirmation screen and sends the message manually.
 */
export async function updateTenantMessengerRedirectEnabledAction(
  tenantId: string,
  enabled: boolean
) {
  const supabase = await createClient()

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints if local types differ
    .update({ messenger_redirect_enabled: enabled } as unknown as never)
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

  return { success: true, enabled }
}

/**
 * Update a tenant's operating hours + timezone. Tenant-admin (or superadmin) only.
 * Operating hours drive advance-order scheduling slot windows; see src/lib/operating-hours.ts.
 * Input is sanitized via normalizeOperatingHours so the stored JSON is always well-formed.
 */
export async function updateOperatingHoursAction(
  tenantId: string,
  operatingHours: OperatingHours | null,
  timezone?: string,
  enforceOperatingHours?: boolean
) {
  const supabase = await createClient()

  // Settings-section write: needs the `settings` permission, like the screen.
  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

  const normalized = normalizeOperatingHours(operatingHours)
  const tz = (timezone || '').trim() || 'Asia/Manila'

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints (columns added via migration).
    .update({
      operating_hours: normalized,
      timezone: tz,
      enforce_operating_hours: enforceOperatingHours === true,
    } as unknown as never)
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

  return {
    success: true,
    operating_hours: normalized,
    timezone: tz,
    enforce_operating_hours: enforceOperatingHours === true,
  }
}

/**
 * Turn the scan-to-collect pickup flow on or off for a store.
 * Tenant-admin (or superadmin) only.
 *
 * Off hides the customer's collection QR AND makes the merchant app refuse
 * tickets — a code screenshotted while the feature was on still decodes, so
 * the app checks this same value on every scan (see the tracking payload's
 * `pickupScanEnabled`).
 */
export async function updatePickupScanAction(
  tenantId: string,
  enabled: boolean
): Promise<{ error?: string; success?: boolean; pickup_scan_enabled?: boolean }> {
  const supabase = await createClient()

  await verifyTenantPermission(tenantId, SETTINGS_PERMISSION)

  const { data, error } = await supabase
    .from('tenants')
    // Cast through unknown to satisfy strict generic constraints (column added via migration).
    .update({ pickup_scan_enabled: enabled === true } as unknown as never)
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
    // Every in-flight tracking page renders the QR from this value.
    revalidatePath(`/${updated.slug}/order`, 'layout')
  }

  return { success: true, pickup_scan_enabled: enabled === true }
}

/**
 * Toggle a single tenant's active state. Superadmin-only.
 */
export async function setTenantActiveAction(
  id: string,
  isActive: boolean
): Promise<{ error?: string; success?: boolean }> {
  try {
    // Deactivation is a delete-class operation.
    await verifyConsolePermission('tenants.delete')
    const supabase = createAdminClient()

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
    // Deactivation is a delete-class operation; the write goes through the
    // service role (see createTenantAction).
    await verifyConsolePermission('tenants.delete')
    const supabase = createAdminClient()

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
    const { user } = await verifyConsolePermission('tenants.delete')

    if (!ids.length) {
      return { deleted: 0, failed: [] }
    }

    const adminClient = createAdminClient()
    let deleted = 0
    const failed: string[] = []

    for (const tenantId of ids) {
      try {
        // Verify tenant exists. `*` because the custom-domain columns
        // (pending_domain) are newer than the generated types.
        const { data: tenant, error: fetchError } = await adminClient
          .from('tenants')
          .select('*')
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
        // `order_items` has no tenant_id column; it cascades from `orders`.
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
          await detachTenantDomains(tenant as TenantDomainColumns)
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
