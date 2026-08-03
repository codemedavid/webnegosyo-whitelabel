/**
 * The branch a printed link named, remembered past the page it arrived on.
 *
 * `/b/{slug}` redirects onto `/{tenant}/menu?outlet={slug}` and stops there, so
 * the branch lives in that URL alone. Cart and checkout are separate routes
 * with no query string; without somewhere to put it, a merchant's per-branch QR
 * code is forgotten the moment the customer taps "Cart", and checkout asks
 * which branch they are standing in.
 *
 * Kept apart from `outlet-selection`'s stored choice on purpose. That record
 * pairs a branch with the MODE the customer picked on the splash chooser, and
 * every reader of it relies on the mode being there. A QR code carries no mode,
 * so widening that record would push a half-filled selection onto code that has
 * no business handling one. This is the smaller, dumber fact: a slug and when
 * it was seen.
 *
 * The slug is stored rather than the id because the link only ever knew the
 * slug, and resolving it against the live branch list at read time is what
 * makes a since-deactivated branch fall back to asking.
 */

import type { StorageLike } from '@/lib/outlets/outlet-selection'

export const LINKED_OUTLET_KEY_PREFIX = 'linked_outlet_'

/** Matches the stored-selection window, so both memories fade together. */
export const LINKED_OUTLET_TTL_MS = 7 * 24 * 60 * 60 * 1000

const storageKey = (tenantSlug: string): string => `${LINKED_OUTLET_KEY_PREFIX}${tenantSlug}`

/**
 * The slug the last branch link named, or null if there is none worth trusting.
 *
 * Storage access is wrapped throughout: Safari's private mode throws on it, and
 * a storefront must not break over where a convenience was cached.
 */
export function readLinkedOutletSlug(
  storage: StorageLike,
  tenantSlug: string,
  now: number
): string | null {
  let raw: string | null
  try {
    raw = storage.getItem(storageKey(tenantSlug))
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { slug, savedAt } = parsed as Record<string, unknown>
    if (typeof slug !== 'string' || slug === '' || typeof savedAt !== 'number') return null

    if (now - savedAt > LINKED_OUTLET_TTL_MS) {
      clearLinkedOutletSlug(storage, tenantSlug)
      return null
    }

    return slug
  } catch {
    clearLinkedOutletSlug(storage, tenantSlug)
    return null
  }
}

export function writeLinkedOutletSlug(
  storage: StorageLike,
  tenantSlug: string,
  slug: string,
  now: number
): void {
  try {
    storage.setItem(storageKey(tenantSlug), JSON.stringify({ slug, savedAt: now }))
  } catch {
    // A customer whose branch cannot be remembered is asked at checkout, which
    // is the behaviour they had before this existed.
  }
}

export function clearLinkedOutletSlug(storage: StorageLike, tenantSlug: string): void {
  try {
    storage.removeItem(storageKey(tenantSlug))
  } catch {
    // See writeLinkedOutletSlug.
  }
}
