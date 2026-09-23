/**
 * @jest-environment node
 */
import {
  hasSupabaseCookie,
  isFrameProtectedPath,
  isPublicRoute,
  isSelfAuthenticatedApiRoute,
  tenantAdminSlugFor,
  tenantRewritePath,
} from '@/lib/middleware/routes'

describe('isPublicRoute', () => {
  it.each([
    '/',
    '/shop/menu',
    '/shop/menu/item/abc',
    '/shop/login',
    '/privacy',
    '/support/contact',
    '/download',
    '/university',
    '/university/getting-started/welcome',
    '/superadmin/login',
    '/superadmin/mcp/authorize',
  ])('treats %s as public', (path) => {
    expect(isPublicRoute(path)).toBe(true)
  })

  it.each(['/shop/admin', '/shop/admin/menu-engineering', '/shop/admin/login', '/superadmin', '/superadmin/tenants', '/shop/cart'])(
    'treats %s as protected or app-owned',
    (path) => {
      expect(isPublicRoute(path)).toBe(false)
    }
  )
})

describe('tenantAdminSlugFor', () => {
  it('extracts the slug of a tenant admin path', () => {
    expect(tenantAdminSlugFor('/shop/admin')).toBe('shop')
    expect(tenantAdminSlugFor('/shop/admin/orders')).toBe('shop')
  })

  it('returns null for everything else', () => {
    expect(tenantAdminSlugFor('/shop/menu')).toBeNull()
    expect(tenantAdminSlugFor('/superadmin')).toBeNull()
    expect(tenantAdminSlugFor('/admin')).toBeNull()
  })
})

describe('isSelfAuthenticatedApiRoute', () => {
  it.each(['/api/webhook', '/api/loyalty/maintenance', '/api/loyverse/reconcile', '/api/messenger/send'])(
    'bypasses %s',
    (path) => {
      expect(isSelfAuthenticatedApiRoute(path)).toBe(true)
    }
  )

  it('does not bypass ordinary API routes', () => {
    expect(isSelfAuthenticatedApiRoute('/api/ai/parse-menu')).toBe(false)
  })
})

describe('tenantRewritePath', () => {
  it('sends the host root to the menu', () => {
    expect(tenantRewritePath('shop', '/')).toBe('/shop/menu')
  })

  it('prefixes any other page with the tenant', () => {
    expect(tenantRewritePath('shop', '/cart')).toBe('/shop/cart')
  })

  it('leaves already-prefixed, API and image-optimiser paths alone', () => {
    expect(tenantRewritePath('shop', '/shop/cart')).toBeNull()
    expect(tenantRewritePath('shop', '/api/orders')).toBeNull()
    expect(tenantRewritePath('shop', '/_next/image')).toBeNull()
  })

  it('does nothing without a tenant', () => {
    expect(tenantRewritePath(null, '/')).toBeNull()
  })
})

describe('hasSupabaseCookie', () => {
  it('is true only when an sb- cookie is present', () => {
    expect(hasSupabaseCookie([{ name: 'sb-abc-auth-token' }])).toBe(true)
    expect(hasSupabaseCookie([{ name: 'cart' }])).toBe(false)
    expect(hasSupabaseCookie([])).toBe(false)
  })
})

describe('path hardening', () => {
  it('collapses repeated slashes before classifying', () => {
    expect(tenantAdminSlugFor('//shop/admin')).toBe('shop')
    expect(tenantAdminSlugFor('/shop//admin/orders')).toBe('shop')
    expect(isPublicRoute('//shop//admin')).toBe(false)
  })

  it('matches the admin segment case-insensitively', () => {
    expect(tenantAdminSlugFor('/shop/ADMIN')).toBe('shop')
    expect(isPublicRoute('/shop/Admin/menu')).toBe(false)
  })

  it('never treats a global API route as a tenant admin path', () => {
    expect(tenantAdminSlugFor('/api/admin/anything')).toBeNull()
  })
})

describe('isFrameProtectedPath', () => {
  it.each([
    '/shop/admin',
    '/shop/admin/branding',
    '/shop/ADMIN/orders',
    '//shop//admin',
    '/shop/login',
    '/shop/login/reset',
    '/superadmin',
    '/superadmin/tenants',
    '/superadmin/login',
    '/superadmin/mcp/authorize',
  ])('refuses cross-origin framing of %s', (path) => {
    expect(isFrameProtectedPath(path)).toBe(true)
  })

  it.each([
    '/',
    '/shop/menu',
    '/shop/menu/item/abc',
    '/shop/cart',
    '/shop/checkout',
    '/shop/about',
    '/shop/admin-tips',
    '/shop/loginx',
    '/privacy',
    '/api/revalidate-menu',
  ])('leaves %s embeddable (merchants embed their storefront)', (path) => {
    expect(isFrameProtectedPath(path)).toBe(false)
  })
})
