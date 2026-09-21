/**
 * Pure host parsing for multi-tenancy. No I/O, safe on the edge runtime.
 *
 * Resolution order (see `resolveTenantSlugFromRequest`): a custom domain,
 * then a `<slug>.<PLATFORM_ROOT_DOMAIN>` subdomain, then nothing.
 */

/** Subdomains that are platform surfaces, never tenant slugs. */
const RESERVED_SUBDOMAINS = new Set(['www', 'superadmin', 'app', 'admin'])

const LOCAL_SUFFIX = '.localhost'
const VERCEL_SUFFIX = '.vercel.app'

/**
 * This product's production hosts. Edge middleware inlines `process.env` at
 * build time; if `PLATFORM_ROOT_DOMAIN` is missing from that bundle, every
 * `*.webnegosyo.com` request used to be treated as a custom domain and waited
 * on Postgres until Vercel returned 504. These fallbacks keep tenant
 * subdomains as pure string parsing even when the env var is absent.
 */
const WELL_KNOWN_PLATFORM_ROOTS = ['webnegosyo.com', 'webnegosyo.app'] as const

function platformRoots(rootDomain: string | null): string[] {
  const configured = rootDomain?.toLowerCase().trim()
  const roots = configured ? [configured] : []
  for (const known of WELL_KNOWN_PLATFORM_ROOTS) {
    if (!roots.includes(known)) roots.push(known)
  }
  return roots
}

/**
 * Canonical form of a domain: no protocol, no `www.`, no trailing slash,
 * lowercase. Both the stored `tenants.domain` and the request host go
 * through this, so `www.Ligna.Cafe/` and `ligna.cafe` are the same key.
 * Returns null for anything without a dot (`localhost`, an empty string).
 */
export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null

  const normalized = domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase()

  if (!normalized.includes('.')) return null
  return normalized
}

/**
 * The bare hostname of a request: lowercase, without port, path or query.
 * Prefers `x-forwarded-host` so the value survives Vercel's proxies.
 */
export function hostFromHeaders(headers: { get(name: string): string | null }): string {
  const raw = headers.get('x-forwarded-host') || headers.get('host') || ''
  return raw.toLowerCase().trim().split(':')[0].split('/')[0].split('?')[0].replace(/[.\s]+$/, '')
}

/** The platform root domain (`webnegosyo.com`), or null outside production. */
export function getRootDomain(): string | null {
  return process.env.PLATFORM_ROOT_DOMAIN || null
}

/**
 * The tenant slug carried by a platform subdomain, or null.
 *
 * `shop.webnegosyo.com` → `shop`; `shop.localhost` → `shop` in development;
 * reserved subdomains and hosts outside the root domain give null. Vercel
 * preview URLs are never a tenant. If the env root is missing, the well-known
 * production hosts (`webnegosyo.com`, `webnegosyo.app`) still parse.
 */
export function extractSubdomain(host: string, rootDomain: string | null): string | null {
  const hostClean = host.toLowerCase().trim()
  if (!hostClean) return null

  if (hostClean.endsWith(LOCAL_SUFFIX)) {
    return acceptSlug(hostClean.split('.')[0])
  }

  for (const root of platformRoots(rootDomain)) {
    const suffix = `.${root}`
    if (!hostClean.endsWith(suffix)) continue
    // `a.b.shop.webnegosyo.com` still resolves to `shop`.
    const labels = hostClean.slice(0, -suffix.length).split('.')
    return acceptSlug(labels[labels.length - 1])
  }

  return null
}

function acceptSlug(label: string | undefined): string | null {
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null
  return label
}

/**
 * Hosts that can never be a custom domain: the platform root and anything
 * under it, Vercel preview URLs, and local development hosts. Skipping the
 * directory lookup for these keeps the common case free of any I/O.
 */
export function isPlatformHost(host: string, rootDomain: string | null): boolean {
  const hostClean = host.toLowerCase().trim()
  if (!hostClean) return false
  if (hostClean === 'localhost' || hostClean.endsWith(LOCAL_SUFFIX)) return true
  if (hostClean.endsWith(VERCEL_SUFFIX)) return true
  return platformRoots(rootDomain).some(
    (root) => hostClean === root || hostClean.endsWith(`.${root}`)
  )
}
