import { revalidateTag } from 'next/cache'
import { storefrontTag, storefrontTenantIdTag } from '@/lib/storefront/cached-read'

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
