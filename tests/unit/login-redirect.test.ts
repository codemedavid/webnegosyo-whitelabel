/**
 * The tenant login form sends the merchant to `?redirect=` after sign-in. The
 * old guard only looked at the raw string (`startsWith('/')`, no `//`, no
 * `%2f`, no `\`), but browsers strip tabs/newlines before resolving, so
 * `/%09/evil.com` → `/\t/evil.com` → `//evil.com` left the site. The fix
 * resolves the value the way the browser will and keeps it only when it stays
 * on this origin AND inside this tenant.
 */
import { describe, it, expect } from '@jest/globals'
import { resolveTenantLoginRedirect } from '@/lib/login-redirect'

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
