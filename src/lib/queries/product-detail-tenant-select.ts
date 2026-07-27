/**
 * Column projection for the product detail page's tenant fetch.
 *
 * Extracted from the inline query in `product-detail-data.ts` for the same reason
 * as `TENANT_STOREFRONT_SELECT`: a column the page renders but the query never
 * selects resolves to `undefined` at runtime and silently falls back to a default.
 * Keeping the list as a standalone constant makes it unit-testable, so a guardrail
 * test can assert that every column a feature depends on is actually fetched.
 */
export const PRODUCT_DETAIL_TENANT_SELECT = `
  id, slug, name, logo_url,
  primary_color, secondary_color, background_color, accent_color,
  text_primary_color, text_secondary_color, text_muted_color,
  border_color, header_color, header_font_color,
  cards_color, cards_border_color, card_title_color, card_price_color, card_description_color,
  modal_background_color, modal_title_color, modal_price_color, modal_description_color,
  button_primary_color, button_primary_text_color, button_secondary_color, button_secondary_text_color,
  link_color, shadow_color, success_color, warning_color, error_color,
  is_active, menu_engineering_enabled, hide_currency_symbol, modifier_groups_enabled,
  checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items,
  bundles_enabled, pairing_rules_enabled,
  convex_deployment_url, convex_schema_version,
  operating_hours, timezone, enforce_operating_hours,
  search_bar_enabled, search_bar_background, search_bar_text, search_bar_placeholder,
  search_bar_icon, search_bar_border, search_bar_focus_ring, search_bar_radius, search_bar_style
`
