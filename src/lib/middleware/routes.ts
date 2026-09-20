/**
 * Route classification for the middleware. Pure functions over a pathname so
 * the access rules can be read and tested without a request.
 */

/**
 * Routes that authenticate themselves (webhook signatures, OAuth state, cron
 * secrets) and need neither tenant resolution nor a session. Doing zero I/O
 * for them matters most for the crons: `/api/loyalty/maintenance` runs every
 * minute, and it was paying for a tenant lookup and a GoTrue round-trip each
 * time — 16 of the 64 middleware 504s logged during the 2026-09-20 outage.
 */
const SELF_AUTHENTICATED_API_PREFIXES = [
  '/api/webhook',
  '/api/auth/facebook',
  '/api/facebook',
  '/api/messenger',
  '/api/loyalty/maintenance',
  '/api/loyverse/reconcile',
] as const

/** Paths the tenant rewrite must never touch: global API routes and the image optimiser. */
const GLOBAL_PATH_PREFIXES = ['/api/'] as const
const IMAGE_OPTIMIZER_PATH = '/_next/image'

/** Prefix of every cookie `@supabase/ssr` writes. */
const SUPABASE_COOKIE_PREFIX = 'sb-'

const TENANT_PUBLIC_PATH = /^\/[^/]+\/(menu|login)(\/|$)/
// Case-insensitive on purpose: the router is case-sensitive, so `/shop/ADMIN`
// is a 404 today, but the gate should not depend on that staying true.
const TENANT_ADMIN_PATH = /^\/([^/]+)\/admin(\/|$)/i

/**
 * The pathname the gates classify: repeated slashes collapsed so `//shop/admin`
 * cannot slip past a regex that expects single separators.
 */
export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/{2,}/g, '/')
}

export function isSelfAuthenticatedApiRoute(pathname: string): boolean {
  return SELF_AUTHENTICATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * Routes a signed-out visitor may open. Tenant menu and login pages, the
 * platform's own public pages, and the superadmin login/OAuth-consent pages.
 * `/<slug>/admin/...` is never public, whatever follows.
 */
export function isPublicRoute(rawPathname: string): boolean {
  const pathname = normalizePathname(rawPathname)
  if (TENANT_ADMIN_PATH.test(pathname)) return false
  return (
    pathname === '/' ||
    TENANT_PUBLIC_PATH.test(pathname) ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/support') ||
    pathname.startsWith('/download') ||
    pathname === '/superadmin/mcp/authorize' ||
    pathname.startsWith('/superadmin/login')
  )
}

/** The slug of a `/<slug>/admin...` path, or null for any other path. */
export function tenantAdminSlugFor(pathname: string): string | null {
  if (GLOBAL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null
  const match = normalizePathname(pathname).match(TENANT_ADMIN_PATH)
  return match ? match[1] : null
}

/**
 * Where a request on a tenant host should be served from, or null when the
 * path must be left alone. The host root goes to the menu; every other page
 * is prefixed with the tenant so app routes stay unified under `/[tenant]`.
 */
export function tenantRewritePath(tenantSlug: string | null, pathname: string): string | null {
  if (!tenantSlug) return null
  if (pathname.startsWith(`/${tenantSlug}/`)) return null
  if (GLOBAL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null
  if (pathname === IMAGE_OPTIMIZER_PATH) return null
  return pathname === '/' ? `/${tenantSlug}/menu` : `/${tenantSlug}${pathname}`
}

/**
 * Whether the request carries a Supabase session cookie. A visitor without
 * one has no session to refresh, so GoTrue has nothing to tell us — that is
 * the bulk of storefront traffic.
 */
export function hasSupabaseCookie(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some((cookie) => cookie.name.startsWith(SUPABASE_COOKIE_PREFIX))
}
