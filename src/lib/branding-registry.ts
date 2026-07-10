/**
 * Branding Studio field registry + cascade resolver.
 *
 * Single source of truth for the /[tenant]/admin/branding editor: the eight
 * editor surfaces, the tenant columns each field maps to, and how unset
 * fields inherit values. Every field id is a real `tenants` column accepted
 * by `saveBrandingAction`'s schema (src/app/actions/branding.ts), and every
 * inherit chain mirrors the runtime fallbacks in `getTenantBranding`
 * (src/lib/branding-utils.ts) so the panel's "↳ Inherits" labels are truthful.
 */

export type BrandingFieldType = 'color' | 'toggle' | 'select' | 'text' | 'number' | 'note' | 'product' | 'banners'

export interface BrandingField {
  id: string
  label: string
  type: BrandingFieldType
  /** Select options (first option is not implicitly the default). */
  options?: readonly string[]
  /** Value used when nothing in draft/tenant/inherit chain is set. */
  default?: string | number | boolean | null
  /** Registry field id this field inherits from when unset. */
  inheritsFrom?: string
  /** Only shown while the mobile preview is active. */
  mobileOnly?: boolean
  placeholder?: string
  min?: number
  max?: number
}

export interface BrandingSection {
  title: string
  fields: BrandingField[]
}

export interface BrandingSurface {
  id: 'global' | 'storefront' | 'cart' | 'checkout' | 'upsell' | 'product' | 'footer' | 'flash'
  label: string
  glyph: string
  description: string
  sections: BrandingSection[]
}

// ---------- field constructors ----------
const color = (id: string, label: string, def: string | null = null, inheritsFrom?: string): BrandingField =>
  ({ id, label, type: 'color', default: def, inheritsFrom })
const toggle = (id: string, label: string, def: boolean): BrandingField =>
  ({ id, label, type: 'toggle', default: def })
const select = (id: string, label: string, options: readonly string[], def: string, mobileOnly = false): BrandingField =>
  ({ id, label, type: 'select', options, default: def, mobileOnly })
const text = (id: string, label: string, placeholder = ''): BrandingField =>
  ({ id, label, type: 'text', default: '', placeholder })
const number = (id: string, label: string, def: number, min: number, max: number): BrandingField =>
  ({ id, label, type: 'number', default: def, min, max })
const note = (id: string, label: string): BrandingField => ({ id, label, type: 'note' })
// A picker whose options are the tenant's own menu items (supplied at runtime,
// not statically). Stored value is the selected menu item id, or '' for none.
const product = (id: string, label: string): BrandingField => ({ id, label, type: 'product', default: '' })
// An inline manager for the tenant's promotion banners (image + title +
// description, add/remove/reorder). Stored value is a PromotionBanner[].
const banners = (id: string, label: string): BrandingField => ({ id, label, type: 'banners' })

const HEADER_TEMPLATE_OPTIONS = ['classic', 'centered', 'minimal', 'split', 'banner', 'stacked'] as const
const CARD_TEMPLATE_OPTIONS = [
  'classic', 'minimal', 'modern', 'elegant', 'compact', 'bold', 'glass',
  'polaroid', 'brutalist', 'magazine', 'zen', 'neon', 'storefront',
] as const
const PAGE_LAYOUT_OPTIONS = ['default', 'sidebar', 'magazine', 'grid-focus', 'list', 'mosaic'] as const
const CART_CHECKOUT_TEMPLATE_OPTIONS = ['classic', 'modern', 'wizard', 'minimal', 'express'] as const

export const BRANDING_SURFACES: BrandingSurface[] = [
  {
    id: 'global',
    label: 'Global Brand',
    glyph: 'G',
    description: 'Foundation palette and theme. Every other surface inherits these when its own field is blank.',
    sections: [
      {
        title: 'Theme',
        fields: [
          select('font_pair', 'Font pairing', ['theme', 'bold display', 'elegant serif', 'warm editorial', 'modern sans'], 'theme'),
          select('card_roundness', 'Corner style', ['theme', 'sharp', 'soft', 'round'], 'theme'),
          select('storefront_palette', 'Coordinated palette', ['theme', 'warm editorial', 'fine dining', 'cafe soft', 'bold diner', 'fresh green'], 'theme'),
        ],
      },
      {
        title: 'Brand palette',
        fields: [
          color('primary_color', 'Primary', '#111111'),
          color('secondary_color', 'Secondary', '#666666'),
          color('accent_color', 'Accent', '#ffd700'),
          color('background_color', 'Page background', '#ffffff'),
          color('border_color', 'Border', '#e5e7eb'),
          color('text_primary_color', 'Primary text', '#111111'),
          color('text_secondary_color', 'Secondary text', '#6b7280'),
          color('text_muted_color', 'Muted text', '#9ca3af'),
          color('link_color', 'Link', '#3b82f6'),
          color('success_color', 'Success', '#10b981'),
          color('warning_color', 'Warning', '#f59e0b'),
          color('error_color', 'Error', '#ef4444'),
        ],
      },
      {
        title: 'Buttons',
        fields: [
          color('button_primary_color', 'Primary button', null, 'primary_color'),
          color('button_primary_text_color', 'Primary button text', '#ffffff'),
          color('button_secondary_color', 'Secondary button', '#f3f4f6'),
          color('button_secondary_text_color', 'Secondary button text', '#111111'),
        ],
      },
    ],
  },
  {
    id: 'storefront',
    label: 'Storefront',
    glyph: 'S',
    description: 'Menu page — announcement, header, hero, navigation, search and menu cards.',
    sections: [
      {
        title: 'Announcement & promotions',
        fields: [
          toggle('is_announcement_visible', 'Show announcement', false),
          text('announcement_text', 'Text', 'Welcome!'),
          color('announcement_bg_color', 'Background', '#FFF4E5'),
          color('announcement_text_color', 'Text color', '#663C00'),
          toggle('is_promotion_visible', 'Show promotion banners', false),
          banners('promotion_banners', 'Promotion banners'),
        ],
      },
      {
        title: 'Header',
        fields: [
          select('header_template', 'Template', HEADER_TEMPLATE_OPTIONS, 'classic'),
          toggle('header_show_logo', 'Show logo', true),
          toggle('header_show_name', 'Show business name', true),
          toggle('header_show_cart', 'Show cart button', true),
          toggle('header_show_search', 'Search in header', false),
          text('header_tagline', 'Tagline', 'Fresh daily · 11am–10pm'),
          color('header_tagline_color', 'Tagline color', null, 'text_muted_color'),
          toggle('header_sticky', 'Sticky header', true),
          toggle('header_blur', 'Blur backdrop', false),
          toggle('header_shadow', 'Drop shadow', false),
          select('header_logo_shape', 'Logo shape', ['circle', 'rounded', 'square'], 'circle'),
          select('header_height', 'Height', ['compact', 'standard', 'tall'], 'standard'),
          color('header_color', 'Background', '#ffffff'),
          color('header_font_color', 'Title color', '#000000'),
          color('menu_main_header_text_color', 'Header text', null, 'text_primary_color'),
          color('menu_main_header_subtitle_color', 'Header subtitle', null, 'text_muted_color'),
          color('menu_cart_badge_background_color', 'Cart badge', null, 'primary_color'),
          color('menu_cart_badge_text_color', 'Cart badge text', null, 'button_primary_text_color'),
        ],
      },
      {
        title: 'Hero',
        fields: [
          toggle('hero_section_enabled', 'Show hero section', true),
          select('hero_preset', 'Style', ['theme', 'centered', 'editorial', 'split', 'banner', 'collage', 'minimal', 'custom'], 'theme'),
          text('hero_kicker', 'Kicker (eyebrow)', 'Now serving'),
          text('hero_title', 'Title', 'Welcome to our menu'),
          text('hero_description', 'Description', 'Order your favorites for pickup or delivery.'),
          text('hero_cta_primary_label', 'Primary button', 'Order Now'),
          text('hero_cta_secondary_label', 'Secondary button', 'View Menu'),
          product('hero_featured_product_id', 'Featured product (hero card)'),
          text('hero_image_url', 'Fallback image URL', 'https://…/photo.jpg'),
          text('hero_link_url', 'Fallback image link', '/menu/item/… or https://…'),
          color('hero_title_color', 'Title color', null, 'text_primary_color'),
          color('hero_description_color', 'Description color', null, 'text_secondary_color'),
          note('note_hero_designer', 'Kicker and buttons appear on the richer hero styles (editorial, split, collage, centered, banner, minimal). A featured product turns the hero tile into a product card (image, price, Add to cart). With no product, paste a Fallback image URL (and optional link) to show a clickable image instead. Pick the "custom" style to render the layout you built in the Hero Designer (block-level, fully custom) — it opens from Admin → Hero Designer.'),
        ],
      },
      {
        title: 'Category navigation',
        fields: [
          select('category_nav_style', 'Style', ['theme', 'pills', 'chips', 'underline'], 'theme'),
          color('menu_category_active_color', 'Active tab', null, 'primary_color'),
          color('menu_category_inactive_color', 'Inactive tab', null, 'text_secondary_color'),
          color('menu_category_header_color', 'Section headings', null, 'primary_color'),
        ],
      },
      {
        title: 'Search bar',
        fields: [
          toggle('search_bar_enabled', 'Show search bar', true),
          select('search_bar_style', 'Style', ['filled', 'outline', 'ghost'], 'filled'),
          select('search_bar_radius', 'Shape', ['pill', 'rounded', 'square'], 'pill'),
          color('search_bar_background', 'Background', null, 'cards_color'),
          color('search_bar_text', 'Text', null, 'text_primary_color'),
          color('search_bar_placeholder', 'Placeholder', null, 'text_muted_color'),
          color('search_bar_icon', 'Icon', null, 'text_muted_color'),
          color('search_bar_border', 'Border', null, 'border_color'),
          color('search_bar_focus_ring', 'Focus ring', null, 'primary_color'),
        ],
      },
      {
        title: 'Layout & menu cards',
        fields: [
          select('page_layout', 'Page layout', PAGE_LAYOUT_OPTIONS, 'default'),
          select('card_template', 'Card template', CARD_TEMPLATE_OPTIONS, 'classic'),
          { ...number('mobile_grid_columns', 'Grid columns (mobile)', 1, 1, 4), mobileOnly: true },
          color('cards_color', 'Card background', '#ffffff'),
          color('cards_border_color', 'Card border', null, 'border_color'),
          color('card_title_color', 'Title text', null, 'text_primary_color'),
          color('card_price_color', 'Price text', null, 'primary_color'),
          color('card_description_color', 'Description text', null, 'text_secondary_color'),
        ],
      },
      {
        title: 'Quick-view modal',
        fields: [
          note('note_quickview', 'The quick-view popup opened from a menu card. The full product page has its own surface (Product Detail).'),
          color('modal_background_color', 'Background', '#ffffff'),
          color('modal_title_color', 'Title', null, 'text_primary_color'),
          color('modal_price_color', 'Price', null, 'primary_color'),
          color('modal_description_color', 'Description', null, 'text_secondary_color'),
        ],
      },
    ],
  },
  {
    id: 'cart',
    label: 'Cart',
    glyph: 'C',
    description: 'Cart page. Blank colors inherit the global palette.',
    sections: [
      {
        title: 'Template',
        fields: [select('cart_template', 'Layout', CART_CHECKOUT_TEMPLATE_OPTIONS, 'classic')],
      },
      {
        title: 'Colors',
        fields: [
          color('cart_background_color', 'Background', null, 'background_color'),
          color('cart_card_background_color', 'Item background', null, 'cards_color'),
          color('cart_summary_background_color', 'Summary background', null, 'cards_color'),
          color('cart_text_color', 'Text', null, 'text_primary_color'),
          color('cart_muted_text_color', 'Muted text', null, 'text_muted_color'),
          color('cart_accent_color', 'Accent', null, 'button_primary_color'),
          color('cart_button_color', 'Button', null, 'cart_accent_color'),
          color('cart_button_text_color', 'Button text', null, 'button_primary_text_color'),
          color('cart_border_color', 'Border', null, 'border_color'),
        ],
      },
    ],
  },
  {
    id: 'checkout',
    label: 'Checkout',
    glyph: 'K',
    description: 'Checkout page. Blank colors inherit the global palette.',
    sections: [
      {
        title: 'Template',
        fields: [select('checkout_template', 'Layout', CART_CHECKOUT_TEMPLATE_OPTIONS, 'classic')],
      },
      {
        title: 'Colors',
        fields: [
          color('checkout_background_color', 'Background', null, 'background_color'),
          color('checkout_card_background_color', 'Card background', null, 'cards_color'),
          color('checkout_summary_background_color', 'Summary background', null, 'cards_color'),
          color('checkout_text_color', 'Text', null, 'text_primary_color'),
          color('checkout_muted_text_color', 'Muted text', null, 'text_muted_color'),
          color('checkout_accent_color', 'Accent', null, 'button_primary_color'),
          color('checkout_button_color', 'Button', null, 'checkout_accent_color'),
          color('checkout_button_text_color', 'Button text', null, 'button_primary_text_color'),
          color('checkout_border_color', 'Border', null, 'border_color'),
        ],
      },
    ],
  },
  {
    id: 'upsell',
    label: 'Upsell Modal',
    glyph: 'U',
    description: '"Before you go…" interstitial shown before checkout.',
    sections: [
      {
        title: 'Colors',
        fields: [
          note('note_upsell_settings', 'Enable/disable, title, subtitle and item picks live in Menu Engineering → Checkout Upsell settings.'),
          color('checkout_modal_background_color', 'Background', null, 'modal_background_color'),
          color('checkout_modal_title_color', 'Title', null, 'modal_title_color'),
          color('checkout_modal_description_color', 'Description', null, 'modal_description_color'),
          color('checkout_modal_price_color', 'Price', null, 'modal_price_color'),
          color('checkout_modal_button_color', 'Button', null, 'button_primary_color'),
          color('checkout_modal_button_text_color', 'Button text', null, 'button_primary_text_color'),
          color('checkout_modal_border_color', 'Border', null, 'border_color'),
        ],
      },
    ],
  },
  {
    id: 'product',
    label: 'Product Detail',
    glyph: 'P',
    description: 'The full product detail page — image, variations, add-ons, sticky footer and upsell sheets. Blank fields inherit the global brand palette.',
    // Product-detail styling lives in the dedicated `product_detail_settings`
    // table, not `tenants`, so its ~96 editable fields come from
    // PRODUCT_DETAIL_SECTIONS (product-detail-registry.ts). The Studio swaps in
    // that registry — and its own draft + publish path — for this surface.
    sections: [
      {
        title: 'Product detail page',
        fields: [note('note_product_detail', 'Every section of the product page is editable here — image, variations, add-ons, related items, sticky footer and the upsell bottom-sheets.')],
      },
    ],
  },
  {
    id: 'footer',
    label: 'Footer',
    glyph: 'F',
    description: 'Site footer — theme presets, contact, social and pages.',
    sections: [
      {
        title: 'Theme',
        fields: [
          toggle('footer_enabled', 'Show footer', true),
          select('footer_theme', 'Theme', ['auto', 'light', 'dark', 'brand', 'midnight', 'minimal', 'custom'], 'auto'),
        ],
      },
      {
        title: 'Content',
        fields: [
          text('footer_logo_url', 'Logo URL'),
          text('footer_business_name', 'Business name'),
          text('footer_tagline', 'Tagline'),
          text('footer_copyright_text', 'Copyright'),
          toggle('footer_show_powered_by', 'Show "Powered by WebNegosyo"', true),
          text('footer_powered_by_text', 'Powered-by text', 'Powered by WebNegosyo'),
        ],
      },
      {
        title: 'Contact',
        fields: [
          text('footer_address', 'Address'),
          text('footer_phone', 'Phone'),
          text('footer_email', 'Email'),
          text('footer_whatsapp', 'WhatsApp'),
          text('footer_viber', 'Viber'),
        ],
      },
      {
        title: 'Social links',
        fields: [
          text('footer_facebook_url', 'Facebook URL'),
          text('footer_facebook_name', 'Facebook label'),
          text('footer_instagram_url', 'Instagram URL'),
          text('footer_instagram_name', 'Instagram label'),
          text('footer_tiktok_url', 'TikTok URL'),
          text('footer_tiktok_name', 'TikTok label'),
          text('footer_twitter_url', 'Twitter / X URL'),
          text('footer_twitter_name', 'Twitter / X label'),
          text('footer_youtube_url', 'YouTube URL'),
          text('footer_youtube_name', 'YouTube label'),
        ],
      },
      {
        title: 'Pages',
        fields: [
          note('note_footer_pages', 'Content shown on the public /about, /terms, /refund and /privacy routes. Leave blank to hide a page.'),
          text('footer_about_us', 'About us'),
          text('footer_terms_of_service', 'Terms of service'),
          text('footer_refund_policy', 'Refund policy'),
          text('footer_privacy_policy', 'Privacy policy'),
        ],
      },
      {
        title: 'Custom colors',
        fields: [
          note('note_footer_custom', 'Applied when theme is set to "custom".'),
          color('footer_background_color', 'Background', '#181512'),
          color('footer_text_color', 'Text', '#f5efe6'),
          color('footer_heading_color', 'Headings', '#ffffff'),
          color('footer_link_color', 'Links', null, 'accent_color'),
          color('footer_muted_color', 'Muted', '#a79e92'),
          color('footer_icon_color', 'Icons', '#f5efe6'),
          color('footer_icon_background_color', 'Icon background', '#332d24'),
          color('footer_border_color', 'Border', '#332d24'),
        ],
      },
    ],
  },
  {
    id: 'flash',
    label: 'Flash Screen',
    glyph: '✦',
    description: 'Splash shown while the storefront loads.',
    sections: [
      {
        title: 'Settings',
        fields: [
          toggle('flash_screen_feature_enabled', 'Enable flash feature', false),
          toggle('flash_screen_is_active', 'Active', false),
          text('flash_screen_title', 'Title', 'Loading menu...'),
          text('flash_screen_subtitle', 'Subtitle'),
          text('flash_screen_image_url', 'Image URL'),
          number('flash_screen_duration_ms', 'Duration (ms)', 2000, 500, 15000),
          color('flash_screen_background_color', 'Background', null, 'primary_color'),
          color('flash_screen_text_color', 'Text', '#ffffff'),
        ],
      },
    ],
  },
]

/** Every editable (non-note) field keyed by tenant column name. */
export const BRANDING_FIELD_INDEX: Record<string, BrandingField> = {}
for (const surface of BRANDING_SURFACES) {
  for (const section of surface.sections) {
    for (const field of section.fields) {
      if (field.type !== 'note') BRANDING_FIELD_INDEX[field.id] = field
    }
  }
}

type ValueBag = Record<string, unknown> | null | undefined

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Raw value for a field: draft entry wins (a present-but-empty draft entry
 * means "cleared"), otherwise the saved tenant column. Returns undefined
 * when neither holds a usable value.
 */
function rawFieldValue(fieldId: string, draft: ValueBag, tenant: ValueBag): unknown {
  if (draft && Object.prototype.hasOwnProperty.call(draft, fieldId)) {
    const value = draft[fieldId]
    return isBlank(value) ? undefined : value
  }
  const saved = tenant?.[fieldId]
  return isBlank(saved) ? undefined : saved
}

/** True when the field holds an explicit value (draft clear beats saved). */
export function isFieldSet(fieldId: string, draft: ValueBag, tenant: ValueBag): boolean {
  return rawFieldValue(fieldId, draft, tenant) !== undefined
}

/**
 * Resolve a field through the cascade: draft → tenant column → inherit
 * chain → registry default.
 */
export function resolveFieldValue(fieldId: string, draft: ValueBag, tenant: ValueBag): unknown {
  let currentId: string | undefined = fieldId
  const visited = new Set<string>()
  let lastField: BrandingField | undefined
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const field: BrandingField | undefined = BRANDING_FIELD_INDEX[currentId]
    if (!field) break
    lastField = field
    const value = rawFieldValue(currentId, draft, tenant)
    if (value !== undefined) return value
    currentId = field.inheritsFrom
  }
  // Nothing set anywhere in the chain — prefer the original field's default,
  // then the deepest ancestor's default (mirrors getTenantBranding fallbacks).
  const own = BRANDING_FIELD_INDEX[fieldId]
  if (own && !isBlank(own.default)) return own.default
  if (lastField && !isBlank(lastField.default)) return lastField.default
  return own?.default ?? null
}

/**
 * Label of the nearest set ancestor a blank field inherits from, or
 * 'Default' when the whole chain is unset.
 */
export function getInheritSourceLabel(fieldId: string, draft: ValueBag, tenant: ValueBag): string {
  let currentId = BRANDING_FIELD_INDEX[fieldId]?.inheritsFrom
  const visited = new Set<string>([fieldId])
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const field = BRANDING_FIELD_INDEX[currentId]
    if (!field) break
    if (isFieldSet(currentId, draft, tenant)) return field.label
    currentId = field.inheritsFrom
  }
  return 'Default'
}

/** All editable field ids belonging to one surface. */
export function getSurfaceFieldIds(surfaceId: BrandingSurface['id']): string[] {
  const surface = BRANDING_SURFACES.find((s) => s.id === surfaceId)
  if (!surface) return []
  return surface.sections.flatMap((section) =>
    section.fields.filter((f) => f.type !== 'note').map((f) => f.id)
  )
}

/**
 * Merge saved tenant values with the unsaved draft into a payload for
 * saveBrandingAction. Only registry-known columns are included; empty
 * strings pass through so a cleared override erases the saved column.
 * primary/secondary are required by the save schema, so they always carry
 * a non-empty value.
 */
export function buildPublishPayload(
  draft: Record<string, unknown>,
  tenant: ValueBag
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const fieldId of Object.keys(BRANDING_FIELD_INDEX)) {
    const value = Object.prototype.hasOwnProperty.call(draft, fieldId)
      ? draft[fieldId]
      : tenant?.[fieldId]
    if (value === undefined || value === null) continue
    payload[fieldId] = value
  }
  if (isBlank(payload.primary_color)) {
    payload.primary_color = String(BRANDING_FIELD_INDEX.primary_color.default)
  }
  if (isBlank(payload.secondary_color)) {
    payload.secondary_color = String(BRANDING_FIELD_INDEX.secondary_color.default)
  }
  return payload
}

// ---------- palette presets ----------
export interface BrandingPreset {
  name: string
  values: Record<string, string>
}

export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    name: 'Sunset Smash',
    values: {
      primary_color: '#1D1815', accent_color: '#E4572E', background_color: '#FFF6EC',
      border_color: '#EBDCCC', text_primary_color: '#1D1815', text_secondary_color: '#6F6F6F',
      text_muted_color: '#9C917E',
    },
  },
  {
    name: 'Crimson Slice',
    values: {
      primary_color: '#191919', accent_color: '#D7263D', background_color: '#FAFAF8',
      border_color: '#E8E8E4', text_primary_color: '#191919', text_secondary_color: '#6F6F6F',
      text_muted_color: '#9A9A9A',
    },
  },
  {
    name: 'Warm Bakery',
    values: {
      primary_color: '#3B2E25', accent_color: '#A4643C', background_color: '#FAF3E8',
      border_color: '#E9DAC5', text_primary_color: '#3B2E25', text_secondary_color: '#7C6C5C',
      text_muted_color: '#94816F',
    },
  },
  {
    name: 'Market Green',
    values: {
      primary_color: '#1C2B22', accent_color: '#2A6F4E', background_color: '#F4F7F2',
      border_color: '#DDE5DA', text_primary_color: '#1C2B22', text_secondary_color: '#5E6B60',
      text_muted_color: '#8B968C',
    },
  },
  {
    name: 'Blue Plate',
    values: {
      primary_color: '#141824', accent_color: '#2A6FDB', background_color: '#F6F7FB',
      border_color: '#E2E5EE', text_primary_color: '#141824', text_secondary_color: '#5D6472',
      text_muted_color: '#9298A6',
    },
  },
]

// ---------- generate palette from a single brand color ----------
function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const r = parseInt(m.substring(0, 2), 16) / 255
  const g = parseInt(m.substring(2, 4), 16) / 255
  const b = parseInt(m.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number): string => {
    const k = (n + h * 12) % 12
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Derive a coordinated storefront palette from one brand/logo color.
 * Ported from the Branding Studio design spec's generator.
 */
export function generatePaletteFromColor(hex: string): Record<string, string> {
  const [h, s] = hexToHsl(hex)
  return {
    accent_color: hex,
    primary_color: hslToHex(h, Math.min(s, 0.4), 0.11),
    background_color: hslToHex(h, Math.min(s, 0.5), 0.965),
    border_color: hslToHex(h, Math.min(s, 0.35), 0.88),
    text_primary_color: hslToHex(h, Math.min(s, 0.4), 0.11),
    text_secondary_color: hslToHex(h, 0.12, 0.42),
    text_muted_color: hslToHex(h, 0.12, 0.6),
  }
}
