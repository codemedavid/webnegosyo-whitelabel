/**
 * Where the tenant login form may send a merchant after sign-in.
 *
 * The `?redirect=` value is attacker-controllable (a phishing link can carry
 * any value), so it is resolved exactly the way the browser will resolve it —
 * `new URL(value, origin)` strips tabs/newlines, turns `\` into `/` and
 * collapses `..` — and kept only when the result is on this origin AND inside
 * this tenant (`/<slug>/…`). Raw-string checks (`startsWith('/')`, no `//`)
 * missed `/%09/evil.com`, which the browser reads as `//evil.com`.
 *
 * `/<slug>/…` is right on every host: the middleware never re-prefixes a path
 * that already starts with the tenant slug, and it produces `redirect` values
 * from the served (`/<slug>/admin/…`) path on path-based, subdomain and
 * custom-domain hosts alike.
 */

/** Whitespace and control characters: the browser silently drops or rewrites these. */
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/

export function defaultTenantLoginRedirect(tenantSlug: string): string {
  return `/${tenantSlug}/admin`
}

export function resolveTenantLoginRedirect(redirect: unknown, tenantSlug: string, origin: string): string {
  const fallback = defaultTenantLoginRedirect(tenantSlug)
  if (typeof redirect !== 'string' || redirect === '') return fallback
  // Only a single-slash site path, typed without anything the browser would rewrite.
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\')) return fallback
  if (CONTROL_OR_SPACE.test(redirect)) return fallback

  let resolved: URL
  try {
    resolved = new URL(redirect, origin)
  } catch {
    return fallback
  }

  if (resolved.origin !== new URL(origin).origin) return fallback
  // Checked on the NORMALIZED path, so `/cafe/%2e%2e/other` (→ `/other`) fails.
  if (!resolved.pathname.startsWith(`/${tenantSlug}/`)) return fallback

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
