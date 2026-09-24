import { revalidatePath, revalidateTag } from 'next/cache'
import { storefrontTag, storefrontTenantIdTag } from '@/lib/storefront/cached-read'
import { isRevalidatableSlug } from '@/lib/tenant-revalidation'

interface StorefrontIdentity {
  slug: string
  id?: string | null
  /** When a slug was renamed, the old slug's entries are purged too. */
  previousSlug?: string | null
}

/**
 * Purge every cached storefront read for one tenant.
 *
 * Only callable from a Server Action or Route Handler (Next's rule for
 * `revalidateTag`). `invalidateTenantCache` calls this, so any write that
 * already invalidates the Redis tenant cache also refreshes the storefront.
 */
export function revalidateStorefront({ slug, id, previousSlug }: StorefrontIdentity): void {
  const tags = [
    storefrontTag(slug),
    previousSlug ? storefrontTag(previousSlug) : null,
    id ? storefrontTenantIdTag(id) : null,
  ]
  tags.filter((tag): tag is string => Boolean(tag)).forEach((tag) => revalidateTag(tag))
}

/**
 * Refresh every storefront surface that shows a tenant's menu after a menu-data
 * write (items, categories, bundles, pairings, presell, menu engineering...).
 *
 * Revalidating only the `/{slug}/menu` path is not enough: an `unstable_cache`
 * entry carries the implicit path tags of whichever route wrote it, so once a
 * second route (the tenant home) reads the same menu, a path-only purge can
 * leave it stale. The data tag is what every reader shares.
 */
export function revalidateStorefrontMenu(slug: string): void {
  // Callers pass a client-supplied slug; `revalidatePath` reads a bracketed
  // segment as the dynamic route, so `[tenant]` would purge every storefront.
  if (!isRevalidatableSlug(slug)) {
    console.warn('[revalidateStorefrontMenu] Skipped purge for a non-plain slug')
    return
  }
  revalidateTag(storefrontTag(slug))
  revalidatePath(`/${slug}/menu`, 'layout')
  revalidatePath(`/${slug}`)
}
