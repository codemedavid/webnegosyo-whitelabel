/**
 * The cart provider wraps the whole app (root layout), so it is mounted in the
 * merchant admin too. A merchant who tests their own store keeps a cart in
 * localStorage, and the provider re-read those dishes from Supabase 1s after
 * every admin page hydrated and on every tab focus — work nobody can see,
 * competing with the admin's own requests. Refreshing belongs to the pages a
 * customer actually shops on.
 */

import { shouldRefreshCartOnPath } from '@/lib/cart-refresh-scope'

describe('shouldRefreshCartOnPath', () => {
  test.each([
    ['/seacook/menu'],
    ['/seacook/cart'],
    ['/seacook/checkout'],
    ['/menu'],
    ['/'],
    ['/seacook/administrator-picks'],
  ])('refreshes on storefront path %s', (pathname) => {
    // Act + Assert
    expect(shouldRefreshCartOnPath(pathname)).toBe(true)
  })

  test.each([
    ['/seacook/admin'],
    ['/seacook/admin/orders'],
    ['/admin/menu'],
    ['/superadmin'],
    ['/superadmin/tenants'],
  ])('skips the merchant/platform console path %s', (pathname) => {
    expect(shouldRefreshCartOnPath(pathname)).toBe(false)
  })
})
