import { generateCacheKey } from '@/lib/redis-cache'

/**
 * Every Redis key that must be dropped when a tenant row changes.
 *
 * The tenant row is cached for 30 minutes and is read by the storefront, the
 * admin shell and the order-backend router, so a stale entry keeps serving the
 * old routing and feature flags long after a superadmin saved a change. Kept
 * pure and separate from the Redis client so the key set is testable.
 */
export interface TenantCacheTarget {
  slug: string
  id: string
  /** The slug before this save, when it changed. */
  previousSlug?: string | null
}

export function tenantCacheKeys({ slug, id, previousSlug }: TenantCacheTarget): string[] {
  const keys = [
    generateCacheKey('tenant', slug),
    generateCacheKey('tenant:by-id', id),
    generateCacheKey('categories', id),
    generateCacheKey('menu-items', id),
  ]

  // A rename leaves the old slug pointing at a stale row until the TTL expires.
  if (previousSlug && previousSlug !== slug) {
    keys.push(generateCacheKey('tenant', previousSlug))
  }

  return keys
}
