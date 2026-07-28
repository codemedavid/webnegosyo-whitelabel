/**
 * Column projection for the storefront (menu page) tenant fetch.
 *
 * Kept as a standalone constant — separate from the server-only Supabase query —
 * so it is unit-testable and so every branding/hero column the storefront
 * actually renders is guaranteed to be selected. A column that renders on the
 * page but is missing here silently resolves to `undefined`, which then falls
 * back to a default that can collide with the background (e.g. hero CTA text
 * turning invisible after publish while the editor preview — which merges the
 * full draft — still looks correct).
 */
export const TENANT_STOREFRONT_SELECT = `
  id, slug, name, logo_url, domain,
  primary_color, secondary_color, background_color, accent_color,
  background_image_url, background_image_opacity, background_image_fit,
  background_image_position, background_image_attachment,
  background_overlay_color, background_overlay_opacity,
  text_primary_color, text_secondary_color, text_muted_color,
  border_color, header_color, header_font_color,
  cards_color, cards_border_color, card_title_color, card_price_color, card_description_color,
  modal_background_color, modal_title_color, modal_price_color, modal_description_color,
  button_primary_color, button_primary_text_color, button_secondary_color, button_secondary_text_color,
  link_color, shadow_color, success_color, warning_color, error_color,
  is_active, menu_engineering_enabled, pairing_rules_enabled, hide_currency_symbol, bundles_enabled,
  modifier_groups_enabled, multi_branch_enabled,
  checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items,
  checkout_modal_background_color, checkout_modal_title_color, checkout_modal_description_color,
  checkout_modal_price_color, checkout_modal_button_color, checkout_modal_button_text_color, checkout_modal_border_color,
  font_pair, card_roundness, brand_color, storefront_palette, category_nav_style, hero_preset,
  card_template, checkout_template, cart_template, page_layout, mobile_page_layout, mobile_card_template,
  header_template, mobile_header_template, header_show_logo, header_show_name, header_show_cart, header_show_search,
  header_tagline, header_tagline_color, header_sticky, header_blur, header_shadow, header_logo_shape, header_height,
  hero_title, hero_description, hero_title_color, hero_description_color, hero_design, hero_section_enabled,
  hero_kicker, hero_cta_primary_label, hero_cta_secondary_label, hero_featured_product_id,
  hero_image_url, hero_link_url,
  hero_background_color, hero_kicker_color, hero_cta_primary_color,
  hero_cta_primary_text_color, hero_cta_secondary_text_color,
  announcement_text, announcement_bg_color, announcement_text_color, is_announcement_visible,
  promotion_image_url,
  facebook_page_id,
  promotion_banners, is_promotion_visible,
  operating_hours, timezone, enforce_operating_hours,
  mapbox_enabled, lalamove_enabled, enable_order_management,
  convex_deployment_url, convex_schema_version,
  mobile_grid_columns, mobile_overrides,
  search_bar_enabled, search_bar_style, search_bar_radius, search_bar_background,
  search_bar_text, search_bar_placeholder, search_bar_icon, search_bar_border, search_bar_focus_ring,
  flash_screen_feature_enabled, flash_screen_is_active, flash_screen_title, flash_screen_subtitle,
  flash_screen_image_url, flash_screen_duration_ms, flash_screen_background_color, flash_screen_text_color,
  menu_main_header_text_color, menu_main_header_subtitle_color,
  menu_category_header_color, menu_category_active_color, menu_category_inactive_color,
  menu_cart_badge_background_color, menu_cart_badge_text_color,
  cart_background_color, cart_card_background_color, cart_text_color, cart_muted_text_color,
  cart_accent_color, cart_button_color, cart_button_text_color, cart_border_color, cart_summary_background_color,
  checkout_background_color, checkout_card_background_color, checkout_text_color, checkout_muted_text_color,
  checkout_accent_color, checkout_button_color, checkout_button_text_color, checkout_border_color, checkout_summary_background_color
`
