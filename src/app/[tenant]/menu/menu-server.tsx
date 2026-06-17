import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem, BundleWithSlots } from '@/types/database'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select(`
      id, slug, name, logo_url, domain,
      primary_color, secondary_color, background_color, accent_color,
      text_primary_color, text_secondary_color, text_muted_color,
      border_color, header_color, header_font_color,
      cards_color, cards_border_color, card_title_color, card_price_color, card_description_color,
      modal_background_color, modal_title_color, modal_price_color, modal_description_color,
      button_primary_color, button_primary_text_color, button_secondary_color, button_secondary_text_color,
      link_color, shadow_color, success_color, warning_color, error_color,
      is_active, menu_engineering_enabled, pairing_rules_enabled, hide_currency_symbol, bundles_enabled,
      checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items,
      checkout_modal_background_color, checkout_modal_title_color, checkout_modal_description_color,
      checkout_modal_price_color, checkout_modal_button_color, checkout_modal_button_text_color, checkout_modal_border_color,
      card_template, checkout_template, cart_template, page_layout, mobile_page_layout, mobile_card_template,
      header_template, mobile_header_template, header_show_logo, header_show_name, header_show_cart, header_show_search,
      header_tagline, header_tagline_color, header_sticky, header_blur, header_shadow, header_logo_shape, header_height,
      hero_title, hero_description, hero_title_color, hero_description_color, hero_design, hero_section_enabled,
      announcement_text, announcement_bg_color, announcement_text_color, is_announcement_visible,
      promotion_image_url,
      facebook_page_id,
      promotion_banners, is_promotion_visible,
      mapbox_enabled, lalamove_enabled, enable_order_management,
      convex_deployment_url, convex_schema_version,
      mobile_grid_columns,
      menu_main_header_text_color, menu_main_header_subtitle_color,
      menu_category_header_color, menu_category_active_color, menu_category_inactive_color,
      menu_cart_badge_background_color, menu_cart_badge_text_color,
      cart_background_color, cart_card_background_color, cart_text_color, cart_muted_text_color,
      cart_accent_color, cart_button_color, cart_button_text_color, cart_border_color, cart_summary_background_color,
      checkout_background_color, checkout_card_background_color, checkout_text_color, checkout_muted_text_color,
      checkout_accent_color, checkout_button_color, checkout_button_text_color, checkout_border_color, checkout_summary_background_color
    `)
    .eq('slug', tenantSlug)
    .eq('is_active', true)
    .maybeSingle()

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], isBrandAdmin: false, error: 'Restaurant not found' }
  }

  const tenant = tenantData as unknown as Tenant

  // Fetch categories, items, and bundles in parallel for better performance
  const bundlesQuery = tenant.bundles_enabled
    ? supabase
        .from('bundles')
        .select(`
          *,
          slots:bundle_slots(
            *,
            category:categories(id, name, icon, icon_color),
            price_overrides:bundle_slot_price_overrides(*)
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('show_on_menu', true)
        .order('display_order', { ascending: true })
    : Promise.resolve({ data: null, error: null })

  const [catsResult, itemsResult, bundleResult] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    supabase.from('menu_items').select('id, tenant_id, category_id, name, description, price, discounted_price, image_url, is_available, is_featured, order, variations, variation_types, addons, bcg_classification, badge_text').eq('tenant_id', tenant.id).eq('is_available', true).order('order'),
    bundlesQuery,
  ])

  // Check if the current user is an admin for this tenant (server-side)
  let isBrandAdmin = false
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: role } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      const currentRole = role as { role: string; tenant_id: string | null } | null
      isBrandAdmin = !!currentRole && (
        currentRole.role === 'superadmin' ||
        (currentRole.role === 'admin' && currentRole.tenant_id === tenant.id)
      )
    }
  } catch {
    // Silently ignore auth errors — default to non-admin
  }

  if (catsResult.error || itemsResult.error) {
    const details = [
      catsResult.error?.message && `categories: ${catsResult.error.message}`,
      itemsResult.error?.message && `items: ${itemsResult.error.message}`,
    ].filter(Boolean).join('; ')
    return { tenant, categories: [], menuItems: [], bundles: [] as BundleWithSlots[], isBrandAdmin, error: `Failed to load menu data (${details})` }
  }

  // Bundle query errors are non-fatal — menu items should still show
  if (bundleResult.error) {
    console.warn('[menu-server] Bundle query failed (migration may not be applied yet):', bundleResult.error.message)
  }

  const bundlesData = (bundleResult.data as unknown as BundleWithSlots[] | null) ?? []

  // Populate each slot's items — filter by included_item_ids when set
  if (bundlesData.length > 0) {
    for (const bundle of bundlesData) {
      for (const slot of bundle.slots ?? []) {
        let query = supabase
          .from('menu_items')
          .select('*')
          .eq('category_id', slot.category_id)
          .eq('tenant_id', tenant.id)
          .eq('is_available', true)
          .order('order', { ascending: true })
        if (slot.included_item_ids && slot.included_item_ids.length > 0) {
          query = query.in('id', slot.included_item_ids)
        }
        const { data: slotItems } = await query
        slot.items = (slotItems as unknown as MenuItem[]) ?? []
      }
    }
  }

  // Filter out bundles with no valid slots
  const bundles = bundlesData.filter((b) => (b.slots ?? []).length > 0)

  return {
    tenant,
    categories: (catsResult.data as unknown as Category[]) || [],
    menuItems: (itemsResult.data as unknown as MenuItem[]) || [],
    bundles,
    isBrandAdmin,
    error: null
  }
}
