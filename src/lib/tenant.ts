/**
 * Tenant resolution for subdomain- and custom-domain-based multi-tenancy.
 *
 * Priority: custom domain → platform subdomain → none. The custom-domain step
 * is answered from the shared directory (`tenant-domains.ts`); the subdomain
 * step is pure string parsing. Neither validates that the slug exists — the
 * storefront's cached tenant read does that once, and renders "not found"
 * for a slug that is not a shop. Validating here used to cost an extra
 * database round-trip on every request during a cold cache, for a question
 * the page answers anyway.
 */
import type { NextRequest } from 'next/server'
import { domainDirectory } from '@/lib/tenant-domains'
import { extractSubdomain, getRootDomain, hostFromHeaders, isPlatformHost } from '@/lib/tenant-host'
import { createLogger } from '@/lib/logger'

export { extractSubdomain, getRootDomain, isPlatformHost, normalizeDomain } from '@/lib/tenant-host'

const log = createLogger('[Tenant Resolution]', 'DEBUG_TENANT_RESOLUTION')

async function resolveTenantSlugForHost(host: string): Promise<string | null> {
  const rootDomain = getRootDomain()

  if (!isPlatformHost(host, rootDomain)) {
    const customDomainSlug = await domainDirectory.lookup(host)
    if (customDomainSlug) {
      log.debug('Resolved via custom domain', { host, slug: customDomainSlug })
      return customDomainSlug
    }
  }

  const subdomainSlug = extractSubdomain(host, rootDomain)
  log.debug(subdomainSlug ? 'Resolved via subdomain' : 'No tenant for host', { host, slug: subdomainSlug })
  return subdomainSlug
}

/** The tenant a request is for, from its host header. Used by the middleware. */
export async function resolveTenantSlugFromRequest(request: NextRequest): Promise<string | null> {
  return resolveTenantSlugForHost(hostFromHeaders(request.headers))
}

/**
 * The same resolution from a Server Component, where only `headers()` is
 * available. The landing page uses it to bounce a tenant host to its menu
 * should the middleware rewrite ever be bypassed.
 */
export async function getTenantSlugFromHeaders(): Promise<string | null> {
  const { headers } = await import('next/headers')
  const host = hostFromHeaders(await headers())
  if (!host) return null
  return resolveTenantSlugForHost(host)
}

/**
 * Drop this runtime's copy of the custom-domain directory so the next
 * request reloads it. Called after a tenant's domain is saved; other
 * runtimes (each edge isolate, each lambda) pick the change up within the
 * directory's ttl on their own.
 */
export function clearDomainCache(domain?: string | null): void {
  log.debug('Domain directory invalidated', { domain })
  domainDirectory.invalidate()
}
