import {
  BRANDING_FIELD_INDEX,
  BRANDING_SURFACES,
  buildPublishPayload,
  resolveFieldValue,
} from '@/lib/branding-registry'
import type { PromotionBanner } from '@/types/database'

/**
 * Registry-level contract for the two Branding Studio additions:
 *   1. The hero Style dropdown offers "custom" so a merchant can switch to the
 *      Hero Designer layout without leaving the editor.
 *   2. Promotion banners are a first-class, editable field (type 'banners')
 *      living in the Storefront surface — no longer a note pointing elsewhere.
 */

function findField(id: string) {
  for (const surface of BRANDING_SURFACES) {
    for (const section of surface.sections) {
      const field = section.fields.find((f) => f.id === id)
      if (field) return field
    }
  }
  return undefined
}

describe('hero_preset registry field', () => {
  it('offers "custom" alongside the built-in presets', () => {
    const field = findField('hero_preset')
    expect(field).toBeDefined()
    expect(field?.options).toContain('custom')
    expect(field?.options).toContain('centered')
  })
})

describe('promotion_banners registry field', () => {
  it('is a registered editable "banners" field in the storefront surface', () => {
    const field = findField('promotion_banners')
    expect(field).toBeDefined()
    expect(field?.type).toBe('banners')
    // Editable fields (non-note) are indexed so the studio drafts/publishes them.
    expect(BRANDING_FIELD_INDEX['promotion_banners']).toBeDefined()
  })

  it('passes the banner array through resolveFieldValue and buildPublishPayload', () => {
    const banners: PromotionBanner[] = [
      { id: 'b1', imageUrl: 'https://cdn/x.jpg', title: 'Sale' },
      { id: 'b2', imageUrl: 'https://cdn/y.jpg' },
    ]

    const resolved = resolveFieldValue('promotion_banners', { promotion_banners: banners }, {})
    expect(resolved).toEqual(banners)

    const payload = buildPublishPayload({ promotion_banners: banners }, {})
    expect(payload.promotion_banners).toEqual(banners)
  })
})
