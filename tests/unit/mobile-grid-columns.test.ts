import { describe, it, expect } from '@jest/globals'
import { brandingPatchSchema, buildBrandingUpdatePayload } from '@/lib/branding-service'
import { resolveMobileGridColumns } from '@/lib/storefront-device-layout'
import { BRANDING_FIELD_INDEX } from '@/lib/branding-registry'

/**
 * Mobile grid columns (cards per row on a phone).
 *
 * The database only accepts 1 or 2 (`tenants_mobile_grid_columns_check`), but
 * the branding schema advertised 1–4, so an MCP `update_branding` asking for 3
 * passed validation and then died on the check constraint. And an MCP client
 * that put the value in `mobile_overrides` (it is a "mobile" setting, after all)
 * saved without error while the storefront — which reads only the column —
 * kept rendering the old count.
 */
describe('mobile_grid_columns validation', () => {
  it('accepts 1 and 2', () => {
    expect(brandingPatchSchema.parse({ mobile_grid_columns: 1 }).mobile_grid_columns).toBe(1)
    expect(brandingPatchSchema.parse({ mobile_grid_columns: 2 }).mobile_grid_columns).toBe(2)
  })

  it('refuses values the database check constraint would refuse', () => {
    expect(brandingPatchSchema.safeParse({ mobile_grid_columns: 3 }).success).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_grid_columns: 0 }).success).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_grid_columns: 1.5 }).success).toBe(false)
  })

  it('offers the Studio stepper only the values the column can hold', () => {
    const field = BRANDING_FIELD_INDEX['mobile_grid_columns']
    expect(field.min).toBe(1)
    expect(field.max).toBe(2)
    expect(field.default).toBe(2)
  })
})

describe('buildBrandingUpdatePayload — mobile_grid_columns in mobile_overrides', () => {
  it('moves an override value onto the real column and out of the map', () => {
    // Arrange
    const parsed = brandingPatchSchema.parse({
      mobile_overrides: { mobile_grid_columns: 2, card_template: 'modern' },
    })

    // Act
    const payload = buildBrandingUpdatePayload(parsed)

    // Assert
    expect(payload.mobile_grid_columns).toBe(2)
    expect(payload.mobile_overrides).toEqual({ card_template: 'modern' })
  })

  it('lets an explicit column value win over a stale override', () => {
    const parsed = brandingPatchSchema.parse({
      mobile_grid_columns: 1,
      mobile_overrides: { mobile_grid_columns: 2 },
    })

    const payload = buildBrandingUpdatePayload(parsed)

    expect(payload.mobile_grid_columns).toBe(1)
    expect(payload.mobile_overrides).toEqual({})
  })

  it('refuses an override value the column cannot hold', () => {
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { mobile_grid_columns: 4 } }).success).toBe(false)
  })

  it('leaves the column untouched when neither place sets it', () => {
    const payload = buildBrandingUpdatePayload(brandingPatchSchema.parse({ mobile_overrides: { card_template: 'zen' } }))

    expect(payload).not.toHaveProperty('mobile_grid_columns')
    expect(payload.mobile_overrides).toEqual({ card_template: 'zen' })
  })
})

describe('resolveMobileGridColumns', () => {
  it('defaults to 2 when the tenant has no value', () => {
    expect(resolveMobileGridColumns(undefined)).toBe(2)
    expect(resolveMobileGridColumns(null)).toBe(2)
  })

  it('keeps an explicit single-column choice', () => {
    expect(resolveMobileGridColumns(1)).toBe(1)
  })

  it('clamps anything else to 2', () => {
    expect(resolveMobileGridColumns(2)).toBe(2)
    expect(resolveMobileGridColumns(4)).toBe(2)
  })
})
