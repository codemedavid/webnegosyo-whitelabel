import { describe, it, expect } from '@jest/globals'
import { tenantCacheKeys } from '@/lib/tenant-cache-keys'

/**
 * The tenant row is cached in Redis for 30 minutes (`CACHE_TTL.TENANT`), and
 * nothing invalidated it — `invalidateTenantCache` had no callers at all. So a
 * superadmin edit (order backend, Convex URL, feature flags) did not take
 * effect until the TTL expired, which reads as "I changed it and nothing
 * happened".
 */

describe('tenantCacheKeys', () => {
  it('covers the slug-keyed and id-keyed tenant entries', () => {
    const keys = tenantCacheKeys({ slug: 'coffee-mode', id: 'tenant-1' })

    expect(keys).toContain('tenant:coffee-mode')
    expect(keys).toContain('tenant:by-id:tenant-1')
  })

  it('covers the menu caches that hang off the tenant', () => {
    const keys = tenantCacheKeys({ slug: 'coffee-mode', id: 'tenant-1' })

    expect(keys).toContain('categories:tenant-1')
    expect(keys).toContain('menu-items:tenant-1')
  })

  it('also clears the previous slug when a tenant is renamed', () => {
    // Otherwise the old slug keeps serving a stale row until the TTL expires.
    const keys = tenantCacheKeys({
      slug: 'coffee-mode',
      id: 'tenant-1',
      previousSlug: 'coffeemode',
    })

    expect(keys).toContain('tenant:coffeemode')
    expect(keys).toContain('tenant:coffee-mode')
  })

  it('does not emit a duplicate key when the slug is unchanged', () => {
    const keys = tenantCacheKeys({
      slug: 'coffee-mode',
      id: 'tenant-1',
      previousSlug: 'coffee-mode',
    })

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('skips the previous slug when there is not one', () => {
    const keys = tenantCacheKeys({ slug: 'coffee-mode', id: 'tenant-1', previousSlug: null })
    expect(keys).toEqual(tenantCacheKeys({ slug: 'coffee-mode', id: 'tenant-1' }))
  })
})
