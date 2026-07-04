/**
 * Product Detail page field registry for the Branding Studio.
 *
 * The product detail page is styled by the dedicated `product_detail_settings`
 * table (see product-detail-theme.ts / product-detail-settings-utils.ts), NOT
 * the `tenants` columns the rest of the Studio edits. Several column names are
 * shared between the two stores (modal_background_color, footer_background_color,
 * checkout_modal_*, page_background_color, card_border_radius…), so this surface
 * gets its own field index to keep the two drafts from colliding.
 *
 * Every field id below is a real `product_detail_settings` column, guarded by
 * VALID_DB_COLUMNS. Blank fields fall back to the tenant's global branding at
 * render time inside `mergeSettingsWithBranding`, so this registry only needs a
 * flat draft → saved → default cascade (no cross-store inherit chains).
 */

import type { BrandingField, BrandingSection } from '@/lib/branding-registry'
import { isFieldSet } from '@/lib/branding-registry'
import { DEFAULT_PRODUCT_DETAIL_SETTINGS } from '@/lib/product-detail-theme'
import { VALID_DB_COLUMNS } from '@/lib/product-detail-settings-utils'

// ---------- field constructors (local — product store is independent) ----------
const def = (id: string): string | null => {
  const value = (DEFAULT_PRODUCT_DETAIL_SETTINGS as Record<string, unknown>)[id]
  return typeof value === 'string' ? value : null
}
const color = (id: string, label: string): BrandingField =>
  ({ id, label, type: 'color', default: def(id) })
const text = (id: string, label: string, placeholder = ''): BrandingField =>
  ({ id, label, type: 'text', default: def(id) ?? '', placeholder })
const toggle = (id: string, label: string, value: boolean): BrandingField =>
  ({ id, label, type: 'toggle', default: value })
const select = (id: string, label: string, options: readonly string[], value: string): BrandingField =>
  ({ id, label, type: 'select', options, default: value })

export const PRODUCT_DETAIL_SECTIONS: BrandingSection[] = [
  {
    title: 'Header & navigation',
    fields: [
      color('header_background_color', 'Header background'),
      color('header_button_background_color', 'Button background'),
      color('header_button_icon_color', 'Button icon'),
      color('breadcrumb_color', 'Breadcrumb'),
      color('breadcrumb_active_color', 'Breadcrumb (active)'),
    ],
  },
  {
    title: 'Image & lightbox',
    fields: [
      color('image_background_color', 'Image background'),
      color('image_placeholder_color', 'Image placeholder'),
      color('sale_badge_background_color', 'Sale badge background'),
      color('sale_badge_text_color', 'Sale badge text'),
      color('modal_background_color', 'Lightbox background'),
      color('modal_close_button_color', 'Lightbox close icon'),
      color('modal_close_button_background', 'Lightbox close background'),
    ],
  },
  {
    title: 'Product info',
    fields: [
      color('product_name_color', 'Product name'),
      text('product_name_font_size', 'Product name size', '24px'),
      text('product_name_font_weight', 'Product name weight', '700'),
      color('description_color', 'Description'),
      text('description_font_size', 'Description size', '14px'),
      color('dietary_tag_background_color', 'Dietary tag background'),
      color('dietary_tag_text_color', 'Dietary tag text'),
      color('dietary_tag_border_color', 'Dietary tag border'),
      text('font_family_heading', 'Heading font'),
      text('font_family_body', 'Body font'),
    ],
  },
  {
    title: 'Variations',
    fields: [
      color('variation_section_title_color', 'Section title'),
      text('variation_section_title_font_size', 'Section title size', '16px'),
      text('variation_required_text', 'Required label', '* Pick 1'),
      text('variation_optional_text', 'Optional label', 'Optional'),
      color('variation_option_background_color', 'Option background'),
      color('variation_option_text_color', 'Option text'),
      color('variation_option_border_color', 'Option border'),
      color('variation_option_selected_background_color', 'Selected background'),
      color('variation_option_selected_text_color', 'Selected text'),
      color('variation_option_selected_border_color', 'Selected border'),
      color('variation_price_modifier_color', 'Price modifier text'),
      color('variation_required_badge_color', 'Required badge'),
    ],
  },
  {
    title: 'Add-ons',
    fields: [
      color('addon_section_title_color', 'Section title'),
      text('addon_section_title_font_size', 'Section title size', '16px'),
      text('addon_optional_text', 'Optional label', '(Optional)'),
      text('addon_price_free_text', 'Free price label', 'Free'),
      color('addon_background_color', 'Option background'),
      color('addon_text_color', 'Option text'),
      color('addon_border_color', 'Option border'),
      color('addon_selected_background_color', 'Selected background'),
      color('addon_selected_text_color', 'Selected text'),
      color('addon_selected_border_color', 'Selected border'),
      color('addon_selected_check_color', 'Checkmark'),
      color('addon_price_color', 'Price text'),
    ],
  },
  {
    title: 'Related items',
    fields: [
      color('related_section_title_color', 'Section title'),
      text('related_section_title_font_size', 'Section title size', '18px'),
      color('related_item_background_color', 'Item background'),
      color('related_item_name_color', 'Item name'),
      color('related_item_price_color', 'Item price'),
    ],
  },
  {
    title: 'Sticky footer & actions',
    fields: [
      color('footer_background_color', 'Footer background'),
      color('footer_border_color', 'Footer border'),
      text('footer_shadow_color', 'Footer shadow', 'rgba(0,0,0,0.1)'),
      color('summary_text_color', 'Summary text'),
      text('footer_empty_summary_text', 'Empty summary text', 'Standard'),
      color('total_price_color', 'Total price'),
      color('original_price_color', 'Original price'),
      color('quantity_controls_background', 'Quantity background'),
      color('quantity_button_color', 'Quantity button'),
      color('quantity_text_color', 'Quantity text'),
      color('buy_now_button_background', 'Buy Now background'),
      color('buy_now_button_text_color', 'Buy Now text'),
      color('buy_now_button_border_color', 'Buy Now border'),
      text('buy_now_button_label', 'Buy Now label', 'Buy Now'),
      color('add_to_cart_button_background', 'Add to Cart background'),
      color('add_to_cart_button_text_color', 'Add to Cart text'),
      text('add_to_cart_button_shadow_color', 'Add to Cart shadow', 'rgba(0,0,0,0.1)'),
      text('add_to_cart_button_label', 'Add to Cart label', 'Add To Cart'),
      text('button_border_radius', 'Button radius', '9999px'),
    ],
  },
  {
    title: 'Layout & motion',
    fields: [
      color('page_background_color', 'Page background'),
      text('page_background_gradient', 'Page gradient (CSS)', 'e.g. 180deg, #fff, #eee'),
      text('section_padding', 'Section padding', '24px'),
      text('card_border_radius', 'Card radius', '12px'),
      toggle('enable_animations', 'Enable animations', true),
      select('animation_speed', 'Animation speed', ['slow', 'normal', 'fast'], 'normal'),
    ],
  },
  {
    title: 'Pairing pop-up ("Perfect with…")',
    fields: [
      color('popup_modal_background_color', 'Background'),
      color('popup_modal_title_color', 'Title'),
      color('popup_modal_description_color', 'Description'),
      color('popup_modal_price_color', 'Price'),
      color('popup_modal_button_color', 'Button'),
      color('popup_modal_button_text_color', 'Button text'),
      color('popup_modal_border_color', 'Border'),
    ],
  },
  {
    title: 'Checkout upsell sheet',
    fields: [
      color('checkout_modal_background_color', 'Background'),
      color('checkout_modal_title_color', 'Title'),
      color('checkout_modal_description_color', 'Description'),
      color('checkout_modal_price_color', 'Price'),
      color('checkout_modal_button_color', 'Button'),
      color('checkout_modal_button_text_color', 'Button text'),
      color('checkout_modal_border_color', 'Border'),
    ],
  },
]

/** Every editable product-detail field keyed by its column name. */
export const PRODUCT_DETAIL_FIELD_INDEX: Record<string, BrandingField> = {}
for (const section of PRODUCT_DETAIL_SECTIONS) {
  for (const field of section.fields) {
    if (field.type !== 'note') PRODUCT_DETAIL_FIELD_INDEX[field.id] = field
  }
}

/** All editable product-detail field ids, in panel order. */
export function getProductDetailFieldIds(): string[] {
  return PRODUCT_DETAIL_SECTIONS.flatMap((section) =>
    section.fields.filter((f) => f.type !== 'note').map((f) => f.id)
  )
}

type ValueBag = Record<string, unknown> | null | undefined

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Resolve a product-detail field: draft entry wins (present-but-empty means
 * cleared), else the saved setting, else the registry default. There is no
 * cross-store inherit chain — blank falls back to global branding at render.
 */
export function resolveProductField(fieldId: string, draft: ValueBag, saved: ValueBag): unknown {
  if (draft && Object.prototype.hasOwnProperty.call(draft, fieldId)) {
    const value = draft[fieldId]
    if (!isBlank(value)) return value
    return PRODUCT_DETAIL_FIELD_INDEX[fieldId]?.default ?? null
  }
  const savedValue = saved?.[fieldId]
  if (!isBlank(savedValue)) return savedValue
  return PRODUCT_DETAIL_FIELD_INDEX[fieldId]?.default ?? null
}

/** True when the field holds an explicit value (draft clear beats saved). */
export function isProductFieldSet(fieldId: string, draft: ValueBag, saved: ValueBag): boolean {
  return isFieldSet(fieldId, draft, saved)
}

/**
 * Merge saved settings with the unsaved draft into a payload for
 * saveProductDetailSettings. Only real DB columns are emitted; empty strings
 * pass through so a cleared override erases the saved column.
 */
export function buildProductSettingsPayload(
  draft: Record<string, unknown>,
  saved: ValueBag
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const fieldId of getProductDetailFieldIds()) {
    const value = Object.prototype.hasOwnProperty.call(draft, fieldId)
      ? draft[fieldId]
      : saved?.[fieldId]
    if (value === undefined || value === null) continue
    if (!VALID_DB_COLUMNS.has(fieldId)) continue
    payload[fieldId] = value
  }
  return payload
}
