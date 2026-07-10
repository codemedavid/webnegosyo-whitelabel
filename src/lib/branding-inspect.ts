/**
 * Branding Studio click-to-inspect protocol + scope registry.
 *
 * Storefront regions carry a `data-branding-scope="<surfaceId>/<region>"`
 * attribute. Inside the editor's preview iframe, an inspector overlay
 * (branding-inspector.tsx) highlights the hovered region and, on click, posts
 * the scope key to the editor, which jumps to the matching surface + accordion
 * section. This module is the single source of truth for which scope keys
 * exist and where each one lands, kept pure so the mapping is unit-testable
 * against BRANDING_SURFACES / PRODUCT_DETAIL_SECTIONS (the test fails if a
 * section is renamed without updating the map).
 */

import { BRANDING_SURFACES, type BrandingSurface } from '@/lib/branding-registry'
import { PRODUCT_DETAIL_SECTIONS } from '@/lib/product-detail-registry'

/** Editor → iframe: turn the hover/click inspector on or off. */
export const BRANDING_INSPECT_MODE_MESSAGE = 'wn-branding-inspect-mode'
/** Iframe → editor: the merchant clicked a highlighted region. */
export const BRANDING_SCOPE_SELECTED_MESSAGE = 'wn-branding-scope-selected'
/** DOM attribute storefront regions are tagged with. */
export const BRANDING_SCOPE_ATTRIBUTE = 'data-branding-scope'

export interface BrandingScopeTarget {
  surfaceId: BrandingSurface['id']
  /** Accordion section title within the surface's settings panel. */
  sectionTitle: string
  /** Short label shown on the hover highlight chip. */
  label: string
  /**
   * Optional field-level anchor: when set, the Studio scrolls to and pulses
   * this exact field row (must belong to the mapped section).
   */
  fieldId?: string
}

const scope = (
  surfaceId: BrandingSurface['id'],
  sectionTitle: string,
  label: string,
  fieldId?: string
): BrandingScopeTarget => ({ surfaceId, sectionTitle, label, fieldId })

export const BRANDING_SCOPE_MAP: Record<string, BrandingScopeTarget> = {
  // Global brand — the page canvas itself.
  'global/palette': scope('global', 'Brand palette', 'Brand palette'),

  // Storefront (menu page) regions.
  'storefront/announcement': scope('storefront', 'Announcement & promotions', 'Announcement bar'),
  'storefront/header': scope('storefront', 'Header', 'Header'),
  'storefront/hero': scope('storefront', 'Hero', 'Hero section'),
  'storefront/category-nav': scope('storefront', 'Category navigation', 'Category navigation'),
  'storefront/search': scope('storefront', 'Search bar', 'Search bar'),
  'storefront/cards': scope('storefront', 'Layout & menu cards', 'Menu cards'),
  'storefront/card-title': scope('storefront', 'Layout & menu cards', 'Card title', 'card_title_color'),
  'storefront/card-price': scope('storefront', 'Layout & menu cards', 'Card price', 'card_price_color'),
  'storefront/card-description': scope('storefront', 'Layout & menu cards', 'Card description', 'card_description_color'),
  'storefront/quickview': scope('storefront', 'Quick-view modal', 'Quick-view modal'),
  'storefront/quickview-title': scope('storefront', 'Quick-view modal', 'Quick-view title', 'modal_title_color'),
  'storefront/quickview-price': scope('storefront', 'Quick-view modal', 'Quick-view price', 'modal_price_color'),
  'storefront/quickview-description': scope('storefront', 'Quick-view modal', 'Quick-view description', 'modal_description_color'),

  // Header elements (shared header-parts pieces used by every template).
  'storefront/header-logo': scope('storefront', 'Header', 'Logo', 'header_logo_shape'),
  'storefront/header-title': scope('storefront', 'Header', 'Business name', 'header_font_color'),
  'storefront/header-tagline': scope('storefront', 'Header', 'Tagline', 'header_tagline_color'),
  'storefront/header-cart': scope('storefront', 'Header', 'Cart button', 'menu_cart_badge_background_color'),

  // Hero text elements (tagged in hero-preset + the plain fallback hero).
  'storefront/hero-title': scope('storefront', 'Hero', 'Hero title', 'hero_title_color'),
  'storefront/hero-description': scope('storefront', 'Hero', 'Hero description', 'hero_description_color'),

  // Cart drawer.
  'cart/template': scope('cart', 'Template', 'Cart layout'),
  'cart/colors': scope('cart', 'Colors', 'Cart'),
  'cart/item': scope('cart', 'Colors', 'Cart item', 'cart_card_background_color'),
  'cart/item-price': scope('cart', 'Colors', 'Item price', 'cart_accent_color'),
  'cart/summary': scope('cart', 'Colors', 'Order summary', 'cart_summary_background_color'),
  'cart/checkout-button': scope('cart', 'Colors', 'Checkout button', 'cart_button_color'),

  // Checkout page.
  'checkout/template': scope('checkout', 'Template', 'Checkout layout'),
  'checkout/colors': scope('checkout', 'Colors', 'Checkout'),

  // "Before you go…" upsell interstitial.
  'upsell/colors': scope('upsell', 'Colors', 'Checkout upsell'),

  // Site footer.
  'footer/theme': scope('footer', 'Theme', 'Footer theme'),
  'footer/content': scope('footer', 'Content', 'Footer'),
  'footer/contact': scope('footer', 'Contact', 'Footer contact'),
  'footer/social': scope('footer', 'Social links', 'Footer social links'),
  'footer/pages': scope('footer', 'Pages', 'Footer pages'),
  'footer/custom-colors': scope('footer', 'Custom colors', 'Footer colors'),

  // Flash / splash screen.
  'flash/settings': scope('flash', 'Settings', 'Flash screen'),

  // Product detail page (product_detail_settings registry).
  'product/header': scope('product', 'Header & navigation', 'Product header'),
  'product/image': scope('product', 'Image & lightbox', 'Product image'),
  'product/info': scope('product', 'Product info', 'Product info'),
  'product/variations': scope('product', 'Variations', 'Variations'),
  'product/addons': scope('product', 'Add-ons', 'Add-ons'),
  'product/related': scope('product', 'Related items', 'Related items'),
  'product/sticky-footer': scope('product', 'Sticky footer & actions', 'Sticky footer'),
  'product/layout': scope('product', 'Layout & motion', 'Page layout'),
  'product/pairing': scope('product', 'Pairing pop-up ("Perfect with…")', 'Pairing pop-up'),
  'product/checkout-upsell': scope('product', 'Checkout upsell sheet', 'Upsell sheet'),

  // Product detail elements — each maps to its exact product_detail_settings field.
  'product/name': scope('product', 'Product info', 'Product name', 'product_name_color'),
  'product/description': scope('product', 'Product info', 'Description', 'description_color'),
  'product/sale-badge': scope('product', 'Image & lightbox', 'Sale badge', 'sale_badge_background_color'),
  'product/variation-option': scope('product', 'Variations', 'Variation option', 'variation_option_background_color'),
  'product/addon-option': scope('product', 'Add-ons', 'Add-on option', 'addon_background_color'),
  'product/related-item': scope('product', 'Related items', 'Related item', 'related_item_background_color'),
  'product/quantity': scope('product', 'Sticky footer & actions', 'Quantity controls', 'quantity_controls_background'),
  'product/add-to-cart': scope('product', 'Sticky footer & actions', 'Add to Cart button', 'add_to_cart_button_background'),
  'product/buy-now': scope('product', 'Sticky footer & actions', 'Buy Now button', 'buy_now_button_background'),
  'product/total-price': scope('product', 'Sticky footer & actions', 'Total price', 'total_price_color'),
}

/**
 * Resolve an untrusted scope key (e.g. from a postMessage payload) to its
 * editor target, or null when it is not a known scope.
 */
export function resolveBrandingScope(scopeKey: unknown): BrandingScopeTarget | null {
  if (typeof scopeKey !== 'string') return null
  return BRANDING_SCOPE_MAP[scopeKey] ?? null
}

/**
 * Index of the target's accordion section within its surface's settings
 * panel (the Studio keys open sections by index). -1 when the section title
 * no longer exists.
 */
/** DOM id of a Studio accordion section — shared by the panel and jump logic. */
export function getBrandingSectionAnchorId(sectionIndex: number): string {
  return `branding-section-${sectionIndex}`
}

/** DOM id of a Studio field row — shared by the panel and jump logic. */
export function getBrandingFieldAnchorId(fieldId: string): string {
  return `branding-field-${fieldId}`
}

export function getScopeSectionIndex(target: BrandingScopeTarget): number {
  const sections =
    target.surfaceId === 'product'
      ? PRODUCT_DETAIL_SECTIONS
      : BRANDING_SURFACES.find((s) => s.id === target.surfaceId)?.sections ?? []
  return sections.findIndex((section) => section.title === target.sectionTitle)
}
