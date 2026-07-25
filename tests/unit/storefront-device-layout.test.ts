import { resolveStorefrontLayout } from '@/lib/storefront-device-layout'

/**
 * Storefront layout resolution per device.
 *
 * The Branding Studio's mobile tab stores a tenant's mobile layout/card/header
 * choice in the `mobile_overrides` map. Older builds wrote dedicated
 * `mobile_page_layout` / `mobile_card_template` / `mobile_header_template`
 * columns instead. When both exist the legacy column used to win, so a merchant
 * could pick a mobile layout in the Studio, publish it, and see nothing change
 * on their phone (or in the Studio's mobile preview). The Studio's choice must
 * win; the legacy column is a fallback only.
 */
describe('resolveStorefrontLayout', () => {
  const tenant = {
    page_layout: 'magazine',
    card_template: 'modern',
    header_template: 'centered',
  }

  it('uses the desktop columns when there are no mobile overrides or legacy columns', () => {
    // Arrange / Act
    const result = resolveStorefrontLayout(tenant, {})

    // Assert
    expect(result.desktopLayout).toBe('magazine')
    expect(result.mobileLayout).toBe('magazine')
    expect(result.desktopCard).toBe('modern')
    expect(result.mobileCard).toBe('modern')
    expect(result.mobileHeader).toBe('centered')
    expect(result.needsDualRender).toBe(false)
  })

  it('falls back to platform defaults when the tenant has no columns set', () => {
    const result = resolveStorefrontLayout({}, {})

    expect(result.desktopLayout).toBe('default')
    expect(result.desktopCard).toBe('classic')
    expect(result.desktopHeader).toBe('classic')
  })

  it('prefers the Studio mobile override over a stale legacy mobile column', () => {
    // The super6 case: mobile_overrides says "default / storefront" but the
    // legacy columns still hold "sidebar / modern" from the old editor.
    const result = resolveStorefrontLayout(
      {
        page_layout: 'default',
        mobile_page_layout: 'sidebar',
        card_template: 'storefront',
        mobile_card_template: 'modern',
        header_template: 'classic',
        mobile_header_template: 'split',
      },
      { page_layout: 'default', card_template: 'storefront', header_template: 'classic' }
    )

    expect(result.mobileLayout).toBe('default')
    expect(result.mobileCard).toBe('storefront')
    expect(result.mobileHeader).toBe('classic')
  })

  it('still honors a legacy mobile column when the Studio has no override', () => {
    const result = resolveStorefrontLayout(
      { page_layout: 'default', mobile_page_layout: 'magazine', card_template: 'classic' },
      {}
    )

    expect(result.mobileLayout).toBe('magazine')
    expect(result.mobileCard).toBe('classic')
  })

  it("treats 'inherit' in a legacy column as no choice at all", () => {
    const result = resolveStorefrontLayout(
      { page_layout: 'list', mobile_page_layout: 'inherit' },
      {}
    )

    expect(result.mobileLayout).toBe('list')
  })

  it('flags a dual render only when the mobile layout or card differs', () => {
    const layoutDiffers = resolveStorefrontLayout(
      { page_layout: 'default', card_template: 'classic' },
      { page_layout: 'mosaic' }
    )
    expect(layoutDiffers.mobileLayout).toBe('mosaic')
    expect(layoutDiffers.needsDualRender).toBe(true)

    const cardDiffers = resolveStorefrontLayout(
      { page_layout: 'default', card_template: 'classic' },
      { card_template: 'polaroid' }
    )
    expect(cardDiffers.mobileCard).toBe('polaroid')
    expect(cardDiffers.needsDualRender).toBe(true)
  })

  it('ignores a null tenant so the menu page can render its error state', () => {
    const result = resolveStorefrontLayout(null, {})

    expect(result.desktopLayout).toBe('default')
    expect(result.needsDualRender).toBe(false)
  })
})
