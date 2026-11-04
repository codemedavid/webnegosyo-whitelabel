/**
 * The tenant login form sends the merchant to `?redirect=` after sign-in. The
 * old guard only looked at the raw string (`startsWith('/')`, no `//`, no
 * `%2f`, no `\`), but browsers strip tabs/newlines before resolving, so
 * `/%09/evil.com` → `/\t/evil.com` → `//evil.com` left the site. The fix
 * resolves the value the way the browser will and keeps it only when it stays
 * on this origin AND inside this tenant.
 */
import { describe, it, expect } from '@jest/globals'
import {
  resolveSameOriginRedirect,
  resolveSuperadminLoginRedirect,
  resolveTenantLoginRedirect,
} from '@/lib/login-redirect'

const ORIGIN = 'https://www.webnegosyo.com'
const SLUG = 'cafe'
const FALLBACK = '/cafe/admin'

const resolve = (redirect: unknown, origin = ORIGIN) => resolveTenantLoginRedirect(redirect, SLUG, origin)

describe('resolveTenantLoginRedirect', () => {
  it.each([
    ['/cafe/admin', '/cafe/admin'],
    ['/cafe/admin/orders', '/cafe/admin/orders'],
    ['/cafe/admin/orders?status=new#top', '/cafe/admin/orders?status=new#top'],
    ['/cafe/subscription', '/cafe/subscription'],
  ])('keeps an in-tenant path %j', (redirect, expected) => {
    expect(resolve(redirect)).toBe(expected)
  })

  it('works the same on a tenant subdomain, where middleware still sends /<slug>/… paths', () => {
    expect(resolve('/cafe/admin/menu', 'https://cafe.webnegosyo.com')).toBe('/cafe/admin/menu')
  })

  it.each([
    '/\t/evil.com',
    '/%09/evil.com',
    '/\n/evil.com',
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/%5cevil.com',
    '/%2f%2fevil.com',
    'https://evil.com',
    'https://evil.com/cafe/admin',
    'HTTPS://evil.com',
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/cafe/../other-shop/admin',
    '/cafe/%2e%2e/other-shop/admin',
    '/other-shop/admin',
    '/cafeteria/admin',
    '/cafe',
    'cafe/admin',
    '',
    null,
    undefined,
    42,
  ])('falls back for %j', (redirect) => {
    expect(resolve(redirect)).toBe(FALLBACK)
  })
})

describe('resolveSameOriginRedirect', () => {
  it('keeps a same-origin path inside the prefix, query and hash included', () => {
    expect(resolveSameOriginRedirect('/area/x?y=1#z', '/area/', ORIGIN, '/fallback')).toBe('/area/x?y=1#z')
  })

  it.each(['/%09/evil.com', '/\\evil.com', '//evil.com', 'https://evil.com/area/x', '/area/../other', '/other', 42])(
    'falls back for %j',
    (redirect) => {
      expect(resolveSameOriginRedirect(redirect, '/area/', ORIGIN, '/fallback')).toBe('/fallback')
    },
  )
})

describe('resolveSuperadminLoginRedirect', () => {
  const resolveSa = (redirect: unknown) => resolveSuperadminLoginRedirect(redirect, ORIGIN)

  it('keeps the MCP consent return path built by superadmin-consent, query string included', () => {
    const target = `/superadmin/mcp/authorize?authorization_id=${encodeURIComponent('abc_123-XYZ')}`
    // The login link carries it URL-encoded; URLSearchParams.get decodes it once.
    const fromQuery = new URLSearchParams(`redirect=${encodeURIComponent(target)}`).get('redirect')
    expect(resolveSa(fromQuery)).toBe(target)
  })

  it.each([
    ['/superadmin', '/superadmin'],
    ['/superadmin/tenants', '/superadmin/tenants'],
    ['/superadmin/tenants?page=2#top', '/superadmin/tenants?page=2#top'],
  ])('keeps a superadmin path %j', (redirect, expected) => {
    expect(resolveSa(redirect)).toBe(expected)
  })

  it.each([
    '/%09/evil.com',
    '/\t/evil.com',
    '/\\evil.com',
    '//evil.com',
    'https://evil.com/superadmin',
    'javascript:alert(1)',
    '/superadmin/../cafe/admin',
    '/superadmin/%2e%2e/cafe/admin',
    '/superadminx',
    '/cafe/admin',
    '',
    null,
  ])('falls back to /superadmin for %j', (redirect) => {
    expect(resolveSa(redirect)).toBe('/superadmin')
  })
})
