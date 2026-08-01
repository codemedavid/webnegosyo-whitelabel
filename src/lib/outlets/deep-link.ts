/**
 * Where `/b/{slug}` sends the customer.
 *
 * The deep link is a redirect and nothing more: it hands the branch to the
 * storefront as `?outlet={slug}` and lets the menu do what it already does.
 * Resolving the branch here instead would mean a second copy of the "is this
 * branch real, active, and still delivering" logic, and the storefront already
 * answers all three in `resolveOutletSelection`.
 *
 * Consequently this never touches the database and never fails.
 */

import { validateOutletSlug } from '@/lib/outlets/reserved-slugs'

/** The prefix `/b/{slug}` is served under. Reserved so no outlet can shadow it. */
export const OUTLET_DEEP_LINK_PREFIX = '/b'

/**
 * The path a merchant copies out of the admin and prints. Defined next to the
 * resolver so the link they hand out and the link the router serves cannot
 * drift apart.
 */
export function buildOutletDeepLinkPath(slug: string): string {
  return `${OUTLET_DEEP_LINK_PREFIX}/${slug}`
}

export interface OutletShareUrlInput {
  /** `window.location.origin` of the admin the merchant is browsing. */
  origin: string
  /** `window.location.pathname` of that same admin page. */
  pathname: string
  tenantSlug: string
  slug: string
}

/**
 * The absolute link a merchant copies out of the admin.
 *
 * A tenant is reachable three ways — custom domain, subdomain, and
 * `/{tenant}/...` path — and only the last needs the tenant segment in the URL.
 * Rather than guess from the hostname, we read it off the admin page the
 * merchant is standing on: if their own URL carries the tenant segment, the
 * link they print needs it too.
 */
export function buildOutletShareUrl({
  origin,
  pathname,
  tenantSlug,
  slug,
}: OutletShareUrlInput): string {
  // Compared segment-wise so `/lucky-joy-cafe/...` is not read as `/lucky-joy`.
  const isPathBased = pathname === `/${tenantSlug}` || pathname.startsWith(`/${tenantSlug}/`)
  const prefix = isPathBased ? `/${tenantSlug}` : ''
  return `${origin}${prefix}${buildOutletDeepLinkPath(slug)}`
}

export type OutletDeepLinkResolution =
  /** The tenant never opted in; the path 404s exactly as it does today. */
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string }

export interface OutletDeepLinkInput {
  isEnabled: boolean
  tenantSlug: string
  rawSlug: string
  /** The incoming query string, with or without its leading `?`. */
  search?: string
}

/**
 * Build the menu URL, carrying over whatever the link arrived with.
 *
 * Campaign and QR links routinely carry `utm_*`; dropping them would silently
 * break a merchant's attribution, and they would have no way to tell that the
 * branch link was the cause.
 */
function menuLocation(tenantSlug: string, search: string | undefined, slug: string | null): string {
  const params = new URLSearchParams(search?.replace(/^\?/, '') ?? '')

  // The path segment is the explicit instruction; a stale `?outlet=` further
  // down the URL does not get to override the link the merchant printed.
  params.delete('outlet')
  if (slug !== null) params.set('outlet', slug)

  const query = params.toString()
  const base = `/${encodeURIComponent(tenantSlug)}/menu`
  return query === '' ? base : `${base}?${query}`
}

export function resolveOutletDeepLink(input: OutletDeepLinkInput): OutletDeepLinkResolution {
  const { isEnabled, tenantSlug, rawSlug, search } = input

  if (!isEnabled) return { kind: 'not-found' }

  const validation = validateOutletSlug(rawSlug)

  // An unusable slug — reserved, malformed, or hostile — lands on the ordinary
  // storefront rather than an error page. The merchant printed this link; a
  // customer standing at the counter should still reach the menu.
  return {
    kind: 'redirect',
    location: menuLocation(tenantSlug, search, validation.ok ? validation.slug : null),
  }
}
