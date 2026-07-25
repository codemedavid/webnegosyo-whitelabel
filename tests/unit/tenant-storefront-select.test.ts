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

/**
 * Same class of bug, different columns: the Branding Studio can edit these on
 * every tenant, but the storefront never selected them — so publishing a mobile
 * override, a search bar style, or a flash screen changed the Studio preview
 * (which merges the full draft) and nothing on the live site.
 */
describe('TENANT_STOREFRONT_SELECT branding columns the menu page renders', () => {
  const tokens = TENANT_STOREFRONT_SELECT.split(/[\s,]+/).filter(Boolean)

  it('projects mobile_overrides so per-device branding applies on a real phone', () => {
    expect(tokens).toContain('mobile_overrides')
  })

  const SEARCH_BAR_COLUMNS = [
    'search_bar_enabled',
    'search_bar_style',
    'search_bar_radius',
    'search_bar_background',
    'search_bar_text',
    'search_bar_placeholder',
    'search_bar_icon',
    'search_bar_border',
    'search_bar_focus_ring',
  ]

  it.each(SEARCH_BAR_COLUMNS)('projects %s (read by getTenantBranding)', (column) => {
    expect(tokens).toContain(column)
  })

  const FLASH_SCREEN_COLUMNS = [
    'flash_screen_feature_enabled',
    'flash_screen_is_active',
    'flash_screen_title',
    'flash_screen_subtitle',
    'flash_screen_image_url',
    'flash_screen_duration_ms',
    'flash_screen_background_color',
    'flash_screen_text_color',
  ]

  it.each(FLASH_SCREEN_COLUMNS)('projects %s (read by buildFlashScreenBranding)', (column) => {
    expect(tokens).toContain(column)
  })

  it('projects each column exactly once', () => {
    const duplicates = tokens.filter((token, index) => tokens.indexOf(token) !== index)
    expect(duplicates).toEqual([])
  })
})
