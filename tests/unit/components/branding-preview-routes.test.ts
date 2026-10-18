/**
 * Branding Studio preview-route mapping.
 *
 * Each editor surface previews a specific storefront route. The cart surface
 * must preview the real right-side CartDrawer (opened over the menu), NOT the
 * standalone /cart page; the product surface must navigate to the real product
 * detail page for a sample item so its settings are visible and editable.
 */
import { getPreviewTarget } from '@/components/admin/branding-studio/preview-routes'

describe('getPreviewTarget', () => {
  const slug = 'demo'

  it('previews the menu with the cart drawer open for the cart surface', () => {
    // Arrange / Act
    const target = getPreviewTarget(slug, 'cart', 'item-1')

    // Assert — cart drawer lives on the menu page, not the /cart route
    expect(target.path).toBe('/demo/menu')
    expect(target.openCart).toBe(true)
  })

  it('navigates to the real product detail page when a sample item exists', () => {
    const target = getPreviewTarget(slug, 'product', 'item-42')
    expect(target.path).toBe('/demo/menu/item/item-42')
    expect(target.openCart).toBeFalsy()
  })

  it('falls back to the menu page for the product surface when no sample item is known', () => {
    const target = getPreviewTarget(slug, 'product', null)
    expect(target.path).toBe('/demo/menu')
  })

  it('previews the checkout page for the checkout surface', () => {
    expect(getPreviewTarget(slug, 'checkout', null).path).toBe('/demo/checkout')
  })

  it('previews the cart for the upsell surface — the last-call offers live there', () => {
    expect(getPreviewTarget(slug, 'upsell', null)).toEqual({ path: '/demo/menu', openCart: true })
  })

  it('previews the full cart page when asked, so the Cart layout setting shows', () => {
    expect(getPreviewTarget(slug, 'cart', null, 'page').path).toBe('/demo/cart')
  })

  it('previews the menu page for global, storefront, footer and flash surfaces', () => {
    for (const surface of ['global', 'storefront', 'footer', 'flash'] as const) {
      const target = getPreviewTarget(slug, surface, 'item-1')
      expect(target.path).toBe('/demo/menu')
      expect(target.openCart).toBeFalsy()
    }
  })
})
