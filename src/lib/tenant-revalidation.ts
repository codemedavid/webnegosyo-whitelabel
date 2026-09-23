import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Route-cache purges are keyed by tenant slug, and `revalidatePath` treats a
 * bracketed segment as the dynamic route itself: `/[tenant]/menu` purges EVERY
 * tenant's storefront. So a purge must never use a slug the caller sent — it
 * uses the slug stored on the tenant the caller was authorized for, and only
 * when that slug is a plain path segment.
 */

const PLAIN_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

/** True when `slug` is a single plain path segment (no brackets, slashes, dots or spaces). */
export function isRevalidatableSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && PLAIN_SLUG.test(slug)
}

/**
 * The stored slug of `tenantId`, or null when the tenant is not found, the read
 * fails, or the stored slug is not a plain segment. Callers skip the purge on
 * null — a missed refresh is recoverable (ISR TTL), a wildcard purge is not.
 */
export async function readTenantSlugById(client: SupabaseClient<Database>, tenantId: string): Promise<string | null> {
  const { data, error } = await client.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
  if (error) {
    console.warn('[readTenantSlugById] Could not read tenant slug:', error.message)
    return null
  }
  const slug = (data as { slug?: unknown } | null)?.slug
  return isRevalidatableSlug(slug) ? slug : null
}
