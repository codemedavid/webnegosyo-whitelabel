import fs from 'fs'
import path from 'path'
import { CART_CHECKOUT_PAGE_COLOR_COLUMNS } from '@/lib/branding-utils'

/**
 * Regression guard for the "cart/checkout page colors save but the editor
 * reopens blank" bug.
 *
 * The branding editor's `tenant` prop comes from getMenuData() in
 * menu-server.tsx via an EXPLICIT column projection (it deliberately does NOT
 * select '*', because that would serialize secret columns — lalamove keys,
 * convex deploy key — to the client). If that projection omits a cart/checkout
 * color column, buildDraftFromTenant() reads `undefined`, the editor shows a
 * blank swatch, and a successful save looks like it "didn't stick".
 *
 * This fails if any palette column is missing from the projection.
 */
describe('menu-server tenant projection — branding round-trip', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/[tenant]/menu/menu-server.tsx'),
    'utf8'
  )
  // Inspect only the tenants .select(`...`) projection, not the whole file.
  const projection = source.slice(
    source.indexOf("from('tenants')"),
    source.indexOf(".eq('slug'")
  )

  it('selects every cart & checkout page color column so the editor reads back saved values', () => {
    const missing = CART_CHECKOUT_PAGE_COLOR_COLUMNS.filter((col) => !projection.includes(col))
    expect(missing).toEqual([])
  })

  it('keeps all 18 palette columns in the single source of truth', () => {
    expect(CART_CHECKOUT_PAGE_COLOR_COLUMNS).toHaveLength(18)
  })
})
