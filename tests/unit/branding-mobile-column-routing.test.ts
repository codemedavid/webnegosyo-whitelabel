import {
  BRANDING_FIELD_INDEX,
  editsTenantColumn,
  type BrandingField,
} from '@/lib/branding-registry'

describe('branding studio mobile field routing', () => {
  const gridField = BRANDING_FIELD_INDEX['mobile_grid_columns']
  const colorField = BRANDING_FIELD_INDEX['cards_color']

  it('marks mobile_grid_columns as column-backed so it is never a mobile override', () => {
    // Arrange / Act / Assert
    expect(gridField).toBeDefined()
    expect(gridField.columnBacked).toBe(true)
  })

  it('routes mobile_grid_columns edits to the tenant column even on the mobile tab', () => {
    // A column-backed field must write to its real tenant column (the storefront
    // reads tenant.mobile_grid_columns directly), not the mobile_overrides map.
    expect(editsTenantColumn(gridField, /* isMobile */ true)).toBe(true)
    expect(editsTenantColumn(gridField, /* isMobile */ false)).toBe(true)
  })

  it('routes ordinary fields to mobile_overrides only while the mobile tab is active', () => {
    expect(editsTenantColumn(colorField, /* isMobile */ false)).toBe(true)
    expect(editsTenantColumn(colorField, /* isMobile */ true)).toBe(false)
  })

  it('defaults unflagged fields to the mobile-override path on mobile', () => {
    const plainField: BrandingField = { id: 'x', label: 'X', type: 'color' }
    expect(editsTenantColumn(plainField, true)).toBe(false)
    expect(editsTenantColumn(plainField, false)).toBe(true)
  })
})
