/**
 * The tenant root (`/` on a tenant host, `/{slug}` on the platform host) is
 * the storefront home. It loads the same cached menu data as /menu and asks
 * the tenant's pack for its home page — a pack without one shows its menu,
 * which is exactly what `/` served before it had its own route.
 */
import type { ReactElement } from 'react'

const mockGetMenuData = jest.fn()
const mockGetStorefrontTenant = jest.fn()

jest.mock('@/app/[tenant]/menu/menu-server', () => ({ getMenuData: (slug: string) => mockGetMenuData(slug) }))
jest.mock('@/app/[tenant]/menu/menu-client', () => ({ MenuClient: () => null }))
jest.mock('@/lib/storefront/storefront-tenant', () => ({
  getStorefrontTenant: (slug: string) => mockGetStorefrontTenant(slug),
}))

const menuData = {
  tenant: { id: 't1', slug: 'shop', name: 'Shop' }, categories: [], menuItems: [], bundles: [], outlets: [],
  outletsFailed: false, menuOverrides: [], overridesFailed: false, isBrandAdmin: false, status: 'ready', error: null,
}

beforeEach(() => {
  mockGetMenuData.mockResolvedValue(menuData)
  mockGetStorefrontTenant.mockResolvedValue({ tenant: menuData.tenant })
})

describe('the home route', () => {
  it('renders the storefront client as the home page with the cached menu data', async () => {
    const { default: HomePage } = await import('@/app/[tenant]/(home)/page')
    const element = (await HomePage({ params: Promise.resolve({ tenant: 'shop' }) })) as ReactElement<Record<string, unknown>>

    expect(mockGetMenuData).toHaveBeenCalledWith('shop')
    expect(element.props).toMatchObject({ page: 'home', tenantSlug: 'shop', allMenuItems: [], status: 'ready' })
  })
})

describe('StorefrontFontLinks', () => {
  it('renders nothing for a tenant without a font pairing', async () => {
    mockGetStorefrontTenant.mockResolvedValue({ tenant: { font_pair: null } })
    const { StorefrontFontLinks } = await import('@/components/customer/storefront-font-links')
    expect(await StorefrontFontLinks({ tenantSlug: 'shop' })).toBeNull()
  })

  it('links the typefaces of the tenant font pairing', async () => {
    mockGetStorefrontTenant.mockResolvedValue({ tenant: { font_pair: 'elegant serif' } })
    const { StorefrontFontLinks } = await import('@/components/customer/storefront-font-links')
    const element = (await StorefrontFontLinks({ tenantSlug: 'shop' })) as ReactElement<{ children: ReactElement<{ href?: string }>[] }>
    const hrefs = element.props.children.map((link) => link.props.href)
    expect(hrefs.some((href) => href?.startsWith('https://fonts.googleapis.com/css2'))).toBe(true)
  })
})
