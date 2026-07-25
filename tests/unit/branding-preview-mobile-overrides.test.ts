import { selectEffectiveMobileOverrides } from '@/hooks/use-branding-preview'

/**
 * The storefront needs to know WHICH fields the merchant gave a distinct mobile
 * value, not just the merged result — that is how it can prefer the Branding
 * Studio's choice over a stale legacy `mobile_*` column. Inside the Studio the
 * effective map is the saved overrides plus the unpublished draft layered on
 * top, so the mobile preview matches what Publish will produce.
 */
describe('selectEffectiveMobileOverrides', () => {
  const tenant = { mobile_overrides: { page_layout: 'sidebar', card_template: 'bold' } }

  it('returns an empty map on a desktop viewport', () => {
    expect(selectEffectiveMobileOverrides(tenant, null, false)).toEqual({})
  })

  it('returns the tenant saved overrides on a mobile viewport', () => {
    expect(selectEffectiveMobileOverrides(tenant, null, true)).toEqual({
      page_layout: 'sidebar',
      card_template: 'bold',
    })
  })

  it('layers the unpublished preview draft over the saved overrides', () => {
    const draft = { __mobileOverrides: { page_layout: 'mosaic' } }

    expect(selectEffectiveMobileOverrides(tenant, draft, true)).toEqual({
      page_layout: 'mosaic',
      card_template: 'bold',
    })
  })

  it('drops keys the draft blanked out (back to inheriting desktop)', () => {
    const draft = { __mobileOverrides: { page_layout: '' } }

    expect(selectEffectiveMobileOverrides(tenant, draft, true)).toEqual({ card_template: 'bold' })
  })

  it('tolerates a tenant with no overrides and a draft with no mobile layer', () => {
    expect(selectEffectiveMobileOverrides(null, null, true)).toEqual({})
    expect(selectEffectiveMobileOverrides({}, {}, true)).toEqual({})
  })
})
