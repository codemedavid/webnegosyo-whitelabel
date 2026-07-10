import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
  BRANDING_SCOPE_ATTRIBUTE,
  BRANDING_SCOPE_MAP,
  resolveBrandingScope,
  getScopeSectionIndex,
  getBrandingSectionAnchorId,
  getBrandingFieldAnchorId,
} from '@/lib/branding-inspect'
import {
  BRANDING_DRAFT_MESSAGE,
  BRANDING_READY_MESSAGE,
} from '@/hooks/use-branding-preview'
import { BRANDING_SURFACES } from '@/lib/branding-registry'
import { PRODUCT_DETAIL_SECTIONS } from '@/lib/product-detail-registry'

/**
 * Click-to-inspect scope registry. Every `data-branding-scope` key a
 * storefront element can carry must resolve to a real editor surface and a
 * real accordion section, otherwise clicking a highlighted element would land
 * the merchant nowhere. These tests keep the map honest as surfaces and
 * section titles evolve.
 */

describe('branding-inspect scope map', () => {
  const scopeEntries = Object.entries(BRANDING_SCOPE_MAP)

  it('has at least one scope for every hoverable storefront region', () => {
    // Anchor scopes the inspector and tagging phases rely on.
    const requiredScopes = [
      'storefront/announcement',
      'storefront/header',
      'storefront/hero',
      'storefront/category-nav',
      'storefront/search',
      'storefront/cards',
      'storefront/quickview',
      'cart/colors',
      'checkout/colors',
      'upsell/colors',
      'footer/content',
      'product/image',
      'product/variations',
      'product/sticky-footer',
    ]
    for (const scope of requiredScopes) {
      expect(BRANDING_SCOPE_MAP[scope]).toBeDefined()
    }
  })

  it('maps every scope to a real surface id', () => {
    const surfaceIds = new Set(BRANDING_SURFACES.map((s) => s.id))
    for (const [scope, target] of scopeEntries) {
      expect(surfaceIds.has(target.surfaceId)).toBe(true)
      // The scope key is namespaced by its surface: '<surfaceId>/<region>'.
      expect(scope.startsWith(`${target.surfaceId}/`)).toBe(true)
    }
  })

  it('maps every scope to a real accordion section title', () => {
    for (const [, target] of scopeEntries) {
      const sections =
        target.surfaceId === 'product'
          ? PRODUCT_DETAIL_SECTIONS
          : BRANDING_SURFACES.find((s) => s.id === target.surfaceId)?.sections ?? []
      const titles = sections.map((s) => s.title)
      expect(titles).toContain(target.sectionTitle)
    }
  })

  it('gives every scope a non-empty hover label', () => {
    for (const [, target] of scopeEntries) {
      expect(typeof target.label).toBe('string')
      expect(target.label.length).toBeGreaterThan(0)
    }
  })
})

describe('resolveBrandingScope', () => {
  it('returns the target for a known scope key', () => {
    const target = resolveBrandingScope('storefront/header')
    expect(target).not.toBeNull()
    expect(target?.surfaceId).toBe('storefront')
    expect(target?.sectionTitle).toBe('Header')
  })

  it('returns null for an unknown scope key', () => {
    expect(resolveBrandingScope('storefront/does-not-exist')).toBeNull()
  })

  it('returns null for non-string input (untrusted postMessage payloads)', () => {
    expect(resolveBrandingScope(undefined)).toBeNull()
    expect(resolveBrandingScope(null)).toBeNull()
    expect(resolveBrandingScope(42)).toBeNull()
    expect(resolveBrandingScope({ scope: 'storefront/header' })).toBeNull()
  })
})

describe('getScopeSectionIndex', () => {
  it('returns the accordion index of the mapped section', () => {
    const target = resolveBrandingScope('storefront/search')
    expect(target).not.toBeNull()
    const storefront = BRANDING_SURFACES.find((s) => s.id === 'storefront')
    const expected = storefront!.sections.findIndex((s) => s.title === 'Search bar')
    expect(expected).toBeGreaterThanOrEqual(0)
    expect(getScopeSectionIndex(target!)).toBe(expected)
  })

  it('resolves product scopes against the product-detail registry', () => {
    const target = resolveBrandingScope('product/variations')
    expect(target).not.toBeNull()
    const expected = PRODUCT_DETAIL_SECTIONS.findIndex((s) => s.title === 'Variations')
    expect(expected).toBeGreaterThanOrEqual(0)
    expect(getScopeSectionIndex(target!)).toBe(expected)
  })

  it('returns -1 when the section title no longer exists', () => {
    expect(
      getScopeSectionIndex({ surfaceId: 'storefront', sectionTitle: 'Gone', label: 'Gone' })
    ).toBe(-1)
  })
})

describe('element-level scopes (inspect every storefront element)', () => {
  /**
   * Every specific element a merchant can see must be clickable in inspect
   * mode and land on the exact field that styles it. Key: scope key →
   * [sectionTitle, fieldId]. These are the elements merchants asked to
   * configure directly: header parts, hero text, quick-view details, cart
   * drawer rows/summary/buttons, and every product-detail element.
   */
  const expectedElementScopes: Record<string, [string, string]> = {
    // Header elements (Storefront → Header)
    'storefront/header-logo': ['Header', 'header_logo_shape'],
    'storefront/header-title': ['Header', 'header_font_color'],
    'storefront/header-tagline': ['Header', 'header_tagline_color'],
    'storefront/header-cart': ['Header', 'menu_cart_badge_background_color'],
    // Hero text elements (Storefront → Hero)
    'storefront/hero-title': ['Hero', 'hero_title_color'],
    'storefront/hero-description': ['Hero', 'hero_description_color'],
    // Quick-view modal elements (Storefront → Quick-view modal)
    'storefront/quickview-title': ['Quick-view modal', 'modal_title_color'],
    'storefront/quickview-price': ['Quick-view modal', 'modal_price_color'],
    'storefront/quickview-description': ['Quick-view modal', 'modal_description_color'],
    // Cart drawer elements (Cart → Colors)
    'cart/item': ['Colors', 'cart_card_background_color'],
    'cart/item-price': ['Colors', 'cart_accent_color'],
    'cart/summary': ['Colors', 'cart_summary_background_color'],
    'cart/checkout-button': ['Colors', 'cart_button_color'],
    // Product detail elements (product_detail_settings registry)
    'product/name': ['Product info', 'product_name_color'],
    'product/description': ['Product info', 'description_color'],
    'product/sale-badge': ['Image & lightbox', 'sale_badge_background_color'],
    'product/variation-option': ['Variations', 'variation_option_background_color'],
    'product/addon-option': ['Add-ons', 'addon_background_color'],
    'product/related-item': ['Related items', 'related_item_background_color'],
    'product/quantity': ['Sticky footer & actions', 'quantity_controls_background'],
    'product/add-to-cart': ['Sticky footer & actions', 'add_to_cart_button_background'],
    'product/buy-now': ['Sticky footer & actions', 'buy_now_button_background'],
    'product/total-price': ['Sticky footer & actions', 'total_price_color'],
  }

  it.each(Object.entries(expectedElementScopes))(
    '%s resolves to its exact section and field',
    (scopeKey, [sectionTitle, fieldId]) => {
      const target = resolveBrandingScope(scopeKey)
      expect(target).not.toBeNull()
      expect(target?.sectionTitle).toBe(sectionTitle)
      expect(target?.fieldId).toBe(fieldId)
      // The section must actually exist so the jump lands somewhere.
      expect(getScopeSectionIndex(target!)).toBeGreaterThanOrEqual(0)
    }
  )
})

describe('field-level scopes', () => {
  it('maps card details to their exact fields', () => {
    expect(resolveBrandingScope('storefront/card-title')?.fieldId).toBe('card_title_color')
    expect(resolveBrandingScope('storefront/card-price')?.fieldId).toBe('card_price_color')
    expect(resolveBrandingScope('storefront/card-description')?.fieldId).toBe(
      'card_description_color'
    )
  })

  it('keeps every fieldId inside the fields of its mapped section', () => {
    for (const [, target] of Object.entries(BRANDING_SCOPE_MAP)) {
      if (!target.fieldId) continue
      const sections =
        target.surfaceId === 'product'
          ? PRODUCT_DETAIL_SECTIONS
          : BRANDING_SURFACES.find((s) => s.id === target.surfaceId)?.sections ?? []
      const section = sections.find((s) => s.title === target.sectionTitle)
      expect(section).toBeDefined()
      const fieldIds = section!.fields.map((f) => f.id)
      expect(fieldIds).toContain(target.fieldId)
    }
  })

  it('exposes stable DOM anchors shared by the Studio panel and jump logic', () => {
    expect(getBrandingSectionAnchorId(3)).toBe('branding-section-3')
    expect(getBrandingFieldAnchorId('card_title_color')).toBe('branding-field-card_title_color')
  })
})

describe('inspect message protocol', () => {
  it('defines message types distinct from the existing draft/ready bridge', () => {
    const all = [
      BRANDING_INSPECT_MODE_MESSAGE,
      BRANDING_SCOPE_SELECTED_MESSAGE,
      BRANDING_DRAFT_MESSAGE,
      BRANDING_READY_MESSAGE,
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('exposes the DOM attribute the storefront tags regions with', () => {
    expect(BRANDING_SCOPE_ATTRIBUTE).toBe('data-branding-scope')
  })
})
