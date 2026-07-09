import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
  BRANDING_SCOPE_ATTRIBUTE,
  BRANDING_SCOPE_MAP,
  resolveBrandingScope,
  getScopeSectionIndex,
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
