/**
 * Which page origin a MapKit browser token may be bound to.
 *
 * The token endpoint is fetched same-origin, and browsers omit the Origin
 * header on same-origin GETs, so the origin is rebuilt from the request host.
 * Only hosts this platform serves get a token: platform roots and their
 * subdomains (pure parsing), or a verified custom domain from the directory.
 */

import { getRootDomain, isPlatformHost, normalizeDomain } from '@/lib/tenant-host'

interface HeaderReader {
  get(name: string): string | null
}

export type CustomDomainLookup = (host: string) => Promise<string | null>

function requestHostWithPort(headers: HeaderReader): string {
  const raw = headers.get('x-forwarded-host') || headers.get('host') || ''
  return raw.split(',')[0].trim().toLowerCase()
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1'
}

async function isServedHost(hostname: string, lookupCustomDomain: CustomDomainLookup): Promise<boolean> {
  if (isPlatformHost(hostname, getRootDomain())) return true
  const domain = normalizeDomain(hostname)
  if (!domain) return false
  try {
    return (await lookupCustomDomain(domain)) !== null
  } catch {
    // An unknown host gets no token; the address field degrades to plain text.
    return false
  }
}

export async function mapKitOriginForRequest(
  headers: HeaderReader,
  lookupCustomDomain: CustomDomainLookup,
): Promise<string | null> {
  const hostWithPort = requestHostWithPort(headers)
  const hostname = hostWithPort.split(':')[0]
  if (!hostname || !(await isServedHost(hostname, lookupCustomDomain))) return null

  const protocol = isLocalHost(hostname) && headers.get('x-forwarded-proto') !== 'https' ? 'http' : 'https'
  return `${protocol}://${hostWithPort}`
}
