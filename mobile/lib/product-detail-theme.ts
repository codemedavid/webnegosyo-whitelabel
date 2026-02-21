/**
 * Product Detail Theme — ported from web src/lib/product-detail-theme.ts
 * Provides mergeSettingsWithBranding() for mobile product detail page
 *
 * NOTE: The web uses a `custom()` helper that compares DB values against table
 * defaults and falls back to branding when they match. This breaks on tenants
 * whose branding has light text (e.g. textPrimary=#ffffff for dark card backgrounds)
 * because the product detail page has a light background.
 *
 * On the mobile we use a simpler strategy:
 *   - Text/content colors  → DB value if non-null, else PD default (always readable)
 *   - Background surfaces   → DB value if non-null, else PD default (always light)
 *   - Accent/selected states → DB value if non-null, else branding (matches theme)
 *   - Buttons               → DB value if non-null, else branding (matches theme)
 */

import { setAlpha } from '@/lib/branding-utils'
import type { BrandingColors } from '@/lib/branding-utils'

export interface ProductDetailSettings {
  id?: string
  tenant_id: string

  page_background_color?: string
  page_background_gradient?: string

  header_background_color?: string
  header_button_background_color?: string
  header_button_icon_color?: string

  image_background_color?: string
  image_placeholder_color?: string
  sale_badge_background_color?: string
  sale_badge_text_color?: string

  product_name_color?: string
  product_name_font_size?: string
  product_name_font_weight?: string

  breadcrumb_color?: string
  breadcrumb_active_color?: string

  description_color?: string
  description_font_size?: string

  dietary_tag_background_color?: string
  dietary_tag_text_color?: string
  dietary_tag_border_color?: string

  variation_section_title_color?: string
  variation_section_title_font_size?: string

  variation_option_background_color?: string
  variation_option_text_color?: string
  variation_option_border_color?: string
  variation_option_selected_background_color?: string
  variation_option_selected_text_color?: string
  variation_option_selected_border_color?: string

  variation_price_modifier_color?: string
  variation_required_badge_color?: string
  variation_required_text?: string
  variation_optional_text?: string

  addon_section_title_color?: string
  addon_section_title_font_size?: string

  addon_background_color?: string
  addon_text_color?: string
  addon_border_color?: string
  addon_selected_background_color?: string
  addon_selected_text_color?: string
  addon_selected_border_color?: string
  addon_selected_check_color?: string
  addon_price_color?: string
  addon_price_free_text?: string
  addon_optional_text?: string

  footer_background_color?: string
  footer_border_color?: string
  footer_shadow_color?: string

  summary_text_color?: string
  total_price_color?: string
  original_price_color?: string
  footer_empty_summary_text?: string

  quantity_controls_background?: string
  quantity_button_color?: string
  quantity_text_color?: string

  buy_now_button_background?: string
  buy_now_button_text_color?: string
  buy_now_button_border_color?: string
  buy_now_button_label?: string

  add_to_cart_button_background?: string
  add_to_cart_button_text_color?: string
  add_to_cart_button_shadow_color?: string
  add_to_cart_button_label?: string

  font_family_heading?: string
  font_family_body?: string

  section_padding?: string
  card_border_radius?: string
  button_border_radius?: string

  enable_animations?: boolean
  animation_speed?: 'slow' | 'normal' | 'fast'

  created_at?: string
  updated_at?: string
}

export const DEFAULT_PRODUCT_DETAIL_SETTINGS: Partial<ProductDetailSettings> = {
  page_background_color: '#ffffff',
  image_background_color: '#f3f4f6',
  image_placeholder_color: '#9ca3af',
  sale_badge_background_color: '#ef4444',
  sale_badge_text_color: '#ffffff',
  product_name_color: '#111827',
  product_name_font_size: '24px',
  product_name_font_weight: '700',
  description_color: '#6b7280',
  description_font_size: '14px',
  variation_section_title_color: '#111827',
  variation_section_title_font_size: '16px',
  variation_option_background_color: '#f9fafb',
  variation_option_text_color: '#374151',
  variation_option_border_color: '#e5e7eb',
  variation_option_selected_text_color: '#ffffff',
  variation_price_modifier_color: '#6b7280',
  variation_required_badge_color: '#6b7280',
  variation_required_text: '* Pick 1',
  variation_optional_text: 'Optional',
  addon_section_title_color: '#111827',
  addon_section_title_font_size: '16px',
  addon_background_color: '#ffffff',
  addon_text_color: '#111827',
  addon_border_color: '#e5e7eb',
  addon_price_color: '#6b7280',
  addon_price_free_text: 'Free',
  addon_optional_text: '(Optional)',
  footer_background_color: '#ffffff',
  footer_border_color: '#e5e7eb',
  footer_shadow_color: 'rgba(0,0,0,0.1)',
  summary_text_color: '#6b7280',
  total_price_color: '#111827',
  original_price_color: '#9ca3af',
  footer_empty_summary_text: 'Standard',
  quantity_controls_background: '#f3f4f6',
  quantity_button_color: '#374151',
  quantity_text_color: '#111827',
  buy_now_button_label: 'Buy Now',
  add_to_cart_button_label: 'Add To Cart',
  add_to_cart_button_text_color: '#ffffff',
  add_to_cart_button_shadow_color: 'rgba(0,0,0,0.1)',
  enable_animations: true,
  animation_speed: 'normal',
}

export interface ProductDetailColors {
  pageBackground: string
  imageBackground: string

  productName: string
  breadcrumb: string
  breadcrumbActive: string
  description: string

  variationSectionTitle: string
  variationOptionBackground: string
  variationOptionText: string
  variationOptionBorder: string
  variationOptionSelectedBackground: string
  variationOptionSelectedText: string
  variationOptionSelectedBorder: string
  variationPriceModifier: string
  variationRequiredBadge: string
  variationRequiredText: string
  variationOptionalText: string

  addonSectionTitle: string
  addonBackground: string
  addonText: string
  addonBorder: string
  addonSelectedBackground: string
  addonSelectedText: string
  addonSelectedBorder: string
  addonSelectedCheck: string
  addonPrice: string
  addonPriceFreeText: string
  addonOptionalText: string

  footerBackground: string
  footerBorder: string

  summaryText: string
  totalPrice: string
  originalPrice: string
  footerEmptySummaryText: string

  quantityControlsBackground: string
  quantityButton: string
  quantityText: string

  buyNowButtonBackground: string
  buyNowButtonText: string
  buyNowButtonBorder: string
  buyNowButtonLabel: string

  addToCartButtonBackground: string
  addToCartButtonText: string
  addToCartButtonLabel: string

  primary: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
}

/**
 * Merge product_detail_settings with tenant branding.
 *
 * Strategy:
 *   pd()      – use the DB setting if non-null, else the PD table default
 *              (safe for text/content on the typically-light PD background)
 *   accent()  – use the DB setting if non-null, else derive from branding
 *              (matches the tenant's theme for interactive/selected states)
 */
export function mergeSettingsWithBranding(
  settings: ProductDetailSettings | null,
  branding: BrandingColors
): ProductDetailColors {
  const d = DEFAULT_PRODUCT_DETAIL_SETTINGS
  const s: Partial<ProductDetailSettings> = settings || {}

  // DB value → PD default (always readable on light background)
  const pd = (val: string | undefined | null, def: string): string => val || def

  // DB value → branding-derived fallback (matches theme)
  const accent = (val: string | undefined | null, brandingVal: string): string => val || brandingVal

  return {
    // Backgrounds — PD defaults ensure light, readable surfaces
    pageBackground: pd(s.page_background_color, branding.background),
    imageBackground: pd(s.image_background_color, d.image_background_color!),

    // Text — PD defaults ensure dark, readable text on light bg
    productName: pd(s.product_name_color, d.product_name_color!),
    breadcrumb: pd(s.breadcrumb_color, d.summary_text_color!),
    breadcrumbActive: accent(s.breadcrumb_active_color, branding.link),
    description: pd(s.description_color, d.description_color!),

    // Variation options
    variationSectionTitle: pd(s.variation_section_title_color, d.variation_section_title_color!),
    variationOptionBackground: pd(s.variation_option_background_color, d.variation_option_background_color!),
    variationOptionText: pd(s.variation_option_text_color, d.variation_option_text_color!),
    variationOptionBorder: pd(s.variation_option_border_color, d.variation_option_border_color!),
    variationOptionSelectedBackground: accent(s.variation_option_selected_background_color, branding.primary),
    variationOptionSelectedText: pd(s.variation_option_selected_text_color, d.variation_option_selected_text_color!),
    variationOptionSelectedBorder: accent(s.variation_option_selected_border_color, branding.primary),
    variationPriceModifier: pd(s.variation_price_modifier_color, d.variation_price_modifier_color!),
    variationRequiredBadge: pd(s.variation_required_badge_color, d.variation_required_badge_color!),
    variationRequiredText: pd(s.variation_required_text, d.variation_required_text!),
    variationOptionalText: pd(s.variation_optional_text, d.variation_optional_text!),

    // Add-ons
    addonSectionTitle: pd(s.addon_section_title_color, d.addon_section_title_color!),
    addonBackground: pd(s.addon_background_color, d.addon_background_color!),
    addonText: pd(s.addon_text_color, d.addon_text_color!),
    addonBorder: pd(s.addon_border_color, d.addon_border_color!),
    addonSelectedBackground: accent(s.addon_selected_background_color, setAlpha(branding.primary, 0.03)),
    addonSelectedText: accent(s.addon_selected_text_color, branding.primary),
    addonSelectedBorder: accent(s.addon_selected_border_color, branding.primary),
    addonSelectedCheck: accent(s.addon_selected_check_color, branding.primary),
    addonPrice: pd(s.addon_price_color, d.addon_price_color!),
    addonPriceFreeText: pd(s.addon_price_free_text, d.addon_price_free_text!),
    addonOptionalText: pd(s.addon_optional_text, d.addon_optional_text!),

    // Footer
    footerBackground: s.footer_background_color || d.footer_background_color!,
    footerBorder: s.footer_border_color || d.footer_border_color!,

    summaryText: pd(s.summary_text_color, d.summary_text_color!),
    totalPrice: pd(s.total_price_color, d.total_price_color!),
    originalPrice: pd(s.original_price_color, d.original_price_color!),
    footerEmptySummaryText: pd(s.footer_empty_summary_text, d.footer_empty_summary_text!),

    // Quantity controls
    quantityControlsBackground: pd(s.quantity_controls_background, d.quantity_controls_background!),
    quantityButton: pd(s.quantity_button_color, d.quantity_button_color!),
    quantityText: pd(s.quantity_text_color, d.quantity_text_color!),

    // Buttons — branding-driven
    buyNowButtonBackground: accent(s.buy_now_button_background, branding.buttonSecondary),
    buyNowButtonText: accent(s.buy_now_button_text_color, branding.buttonPrimary),
    buyNowButtonBorder: accent(s.buy_now_button_border_color, branding.primary),
    buyNowButtonLabel: pd(s.buy_now_button_label, d.buy_now_button_label!),

    addToCartButtonBackground: accent(s.add_to_cart_button_background, branding.buttonPrimary),
    addToCartButtonText: accent(s.add_to_cart_button_text_color, branding.buttonPrimaryText),
    addToCartButtonLabel: pd(s.add_to_cart_button_label, d.add_to_cart_button_label!),

    // Branding pass-through
    primary: branding.primary,
    textPrimary: branding.textPrimary,
    textSecondary: branding.textSecondary,
    textMuted: branding.textMuted,
    border: branding.border,
  }
}
