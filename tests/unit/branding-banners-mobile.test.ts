import { BRANDING_SURFACES, editsTenantColumn, type BrandingField } from '@/lib/branding-registry'
import { brandingSchema } from '@/lib/branding-service'

/**
 * Regression: uploading a promotion banner and toggling it on failed with
 * "Validation error: Invalid input" while the Branding Studio was on the Mobile
 * tab. On mobile, non-`columnBacked` fields are written into the tenant's
 * `mobile_overrides` JSONB map — but that map only accepts scalar values
 * (string | number | boolean | null). A `promotion_banners` value is an ARRAY,
 * so routing it through mobile_overrides fails the schema. Banner content is
 * shared across devices, so the banners field must always edit its real tenant
 * column regardless of the active device tab.
 */

function findField(id: string): BrandingField {
  for (const surface of BRANDING_SURFACES) {
    for (const section of surface.sections) {
      const field = section.fields.find((f) => f.id === id)
      if (field) return field
    }
  }
  throw new Error(`branding field not found: ${id}`)
}

describe('promotion banners on the mobile tab', () => {
  it('edits the tenant column (not mobile_overrides) even on mobile', () => {
    const banners = findField('promotion_banners')
    // Desktop always edits the column.
    expect(editsTenantColumn(banners, false)).toBe(true)
    // Mobile must ALSO edit the column — the array can never live in the
    // scalar-only mobile_overrides map.
    expect(editsTenantColumn(banners, true)).toBe(true)
  })

  it('the banners field is flagged columnBacked', () => {
    expect(findField('promotion_banners').columnBacked).toBe(true)
  })
})

describe('mobile_overrides schema guards the banner array out', () => {
  it('rejects an array value in mobile_overrides (why banners must be columnBacked)', () => {
    const result = brandingSchema.safeParse({
      mobile_overrides: {
        promotion_banners: [{ id: 'b1', imageUrl: 'https://ik.imagekit.io/x/a.png' }],
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts a promotion_banners array on the real tenant column', () => {
    const result = brandingSchema.safeParse({
      // primary/secondary colors are always present in a real publish payload.
      primary_color: '#111111',
      secondary_color: '#666666',
      is_promotion_visible: true,
      promotion_banners: [
        { id: 'b1', imageUrl: 'https://ik.imagekit.io/x/a.png', title: 'Hi' },
      ],
    })
    expect(result.success).toBe(true)
  })
})
