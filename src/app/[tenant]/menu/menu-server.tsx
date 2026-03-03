import { createClient } from '@/lib/supabase/server'
import type { Tenant, Category, MenuItem } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

export async function getMenuData(tenantSlug: string) {
  const supabase = await createClient()

  const { data: tenantData, error: tenantError } = await supabase
    .from('tenants')
    .select(`
      id, slug, name, logo_url, description, hero_image_url,
      primary_color, secondary_color, background_color,
      text_primary_color, text_secondary_color, text_muted_color,
      border_color, header_color, header_font_color,
      cards_color, cards_border_color, card_title_color, card_price_color, card_description_color,
      modal_background_color, modal_title_color, modal_price_color, modal_description_color,
      button_primary_color, button_primary_text_color, button_secondary_color, button_secondary_text_color,
      link_color, shadow_color, success_color, warning_color, error_color, accent_color,
      is_active, menu_engineering_enabled, hide_currency_symbol, bundles_enabled,
      checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items,
      checkout_modal_background, checkout_modal_title_color, checkout_modal_description_color,
      checkout_modal_price_color, checkout_modal_button_color, checkout_modal_button_text_color, checkout_modal_border_color,
      card_template, menu_layout,
      facebook_page_id, facebook_page_name, currency, currency_symbol,
      promotion_banners, is_promotion_visible,
      mapbox_enabled, lalamove_enabled, enable_order_management,
      convex_deployment_url, convex_schema_version,
      mobile_grid_columns, category_navigation_bg_color, category_navigation_text_color,
      category_navigation_active_bg_color, category_navigation_active_text_color,
      category_header_bg_color, category_header_text_color, category_header_border_color,
      cart_badge_bg_color, cart_badge_text_color
    `)
    .eq('slug', tenantSlug)
    .eq('is_active', true)
    .maybeSingle()

  if (tenantError || !tenantData) {
    return { tenant: null, categories: [], menuItems: [], bundles: [] as BundleWithItems[], error: 'Restaurant not found' }
  }

  const tenant = tenantData as Tenant

  // Fetch categories, items, and bundles in parallel for better performance
  const bundlesQuery = tenant.bundles_enabled
    ? supabase
        .from('bundles')
        .select(`
          *,
          items:bundle_items(
            *,
            menu_item:menu_items(*)
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('show_on_menu', true)
        .order('display_order', { ascending: true })
    : Promise.resolve({ data: null, error: null })

  const [catsResult, itemsResult, bundleResult] = await Promise.all([
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('order'),
    supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).eq('is_available', true).order('order'),
    bundlesQuery,
  ])

  if (catsResult.error || itemsResult.error || bundleResult.error) {
    const details = [
      catsResult.error?.message && `categories: ${catsResult.error.message}`,
      itemsResult.error?.message && `items: ${itemsResult.error.message}`,
      bundleResult.error?.message && `bundles: ${bundleResult.error.message}`,
    ].filter(Boolean).join('; ')
    return { tenant, categories: [], menuItems: [], bundles: [] as BundleWithItems[], error: `Failed to load menu data (${details})` }
  }

  const bundles = (!bundleResult.error && bundleResult.data
    ? bundleResult.data as unknown as BundleWithItems[]
    : []) as BundleWithItems[]

  return {
    tenant,
    categories: (catsResult.data as Category[]) || [],
    menuItems: (itemsResult.data as MenuItem[]) || [],
    bundles,
    error: null
  }
}