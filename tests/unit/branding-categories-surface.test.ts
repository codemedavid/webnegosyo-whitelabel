/**
 * Branding Studio "Menu Layout" surface registration.
 *
 * The categories surface is a custom panel (like the Product surface) — the
 * registry entry gives it a rail slot and the preview route maps to /menu.
 */
import { BRANDING_SURFACES } from '@/lib/branding-registry'
import { getPreviewTarget } from '@/components/admin/branding-studio/preview-routes'

describe('categories branding surface', () => {
  it('is registered in BRANDING_SURFACES', () => {
    const surface = BRANDING_SURFACES.find((s) => s.id === 'categories')
    expect(surface).toBeDefined()
    expect(surface?.label).toBe('Menu Layout')
    expect(surface?.glyph).toBeTruthy()
  })

  it('previews on the menu page', () => {
    expect(getPreviewTarget('acme', 'categories')).toEqual({ path: '/acme/menu' })
  })
})
