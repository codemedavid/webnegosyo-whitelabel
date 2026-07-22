import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'

/**
 * The storefront (menu page) projection must select every hero element color
 * column the hero renders. When these were missing, published storefronts read
 * `undefined` for the merchant's chosen kicker/CTA colors and fell back to
 * defaults that collided with the background (invisible CTA text, hidden kicker
 * badge) — even though the Branding Studio preview, which merges the full draft,
 * looked correct. This pins the read path so a dropped column fails loudly.
 */
describe('TENANT_STOREFRONT_SELECT hero element colors', () => {
  const tokens = TENANT_STOREFRONT_SELECT.split(/[\s,]+/).filter(Boolean)

  const HERO_COLOR_COLUMNS = [
    'hero_background_color',
    'hero_kicker_color',
    'hero_cta_primary_color',
    'hero_cta_primary_text_color',
    'hero_cta_secondary_text_color',
  ]

  it.each(HERO_COLOR_COLUMNS)('projects %s so it survives publish', (column) => {
    expect(tokens).toContain(column)
  })

  it('still projects the hero text colors that already worked', () => {
    expect(tokens).toContain('hero_title_color')
    expect(tokens).toContain('hero_description_color')
  })
})
