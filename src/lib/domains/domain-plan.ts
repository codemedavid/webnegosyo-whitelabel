/**
 * Pure rules for merchant custom domains. No I/O.
 *
 * Two columns, two meanings:
 *
 *   tenants.pending_domain → a claim in progress. It never routes. It carries
 *                            a random token the owner publishes as a TXT
 *                            record, proving the domain's DNS owner chose
 *                            THIS store (DNS pointing at the shared Vercel
 *                            project proves only that they chose the platform).
 *   tenants.domain         → proven and routed. The only column the
 *                            middleware's domain directory reads. Legacy rows
 *                            set by hand before this system are trusted as-is.
 */

import { isPlatformHost, normalizeDomain } from '@/lib/tenant-host'

/** `pending` = claimed, ownership not yet proven; `active` = routed. */
export type CustomDomainStatus = 'pending' | 'active'

export interface VerificationChallenge {
  type: string
  domain: string
  value: string
  reason: string
}

export interface DnsRecord {
  type: 'A' | 'CNAME' | 'TXT'
  /** The name to enter at the DNS provider: `@`, `www`, `order`, `_vercel`. */
  host: string
  value: string
  purpose: 'routing' | 'www' | 'ownership' | 'verification'
}

export interface OwnershipChallenge {
  /** Fully-qualified TXT record name. */
  name: string
  value: string
}

export type ParsedDomain = { ok: true; domain: string } | { ok: false; error: string }

/** An unproven claim blocks other stores for no longer than this. */
export const PENDING_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Vercel's documented defaults, used when the config API gives no recommendation. */
export const DEFAULT_VERCEL_IPV4 = '76.76.21.21'
export const DEFAULT_VERCEL_CNAME = 'cname.vercel-dns.com'

const MAX_DOMAIN_LENGTH = 253
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
// Alphabetic or punycode. Rejects IP addresses, whose last label is numeric.
const TLD_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

const OWNERSHIP_LABEL = '_webnegosyo'
const OWNERSHIP_PREFIX = 'webnegosyo-verification='

const FORMAT_ERROR = 'Enter a domain like order.yourstore.com or yourstore.com'

/**
 * What an owner typed → the domain to store. Accepts pasted URLs
 * (`https://www.shop.com/menu`); `www.` is dropped because the apex is stored
 * and `www` is attached as a redirect to it.
 */
export function parseCustomDomainInput(raw: string, rootDomain: string | null): ParsedDomain {
  const hostOnly = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .split(':')[0]
    .replace(/\.+$/, '')

  const domain = normalizeDomain(hostOnly)
  if (!domain || domain.length > MAX_DOMAIN_LENGTH) return { ok: false, error: FORMAT_ERROR }

  const labels = domain.split('.')
  const isWellFormed = labels.every((label) => LABEL_PATTERN.test(label)) && TLD_PATTERN.test(labels[labels.length - 1])
  if (!isWellFormed) return { ok: false, error: FORMAT_ERROR }

  if (isPlatformHost(domain, rootDomain)) {
    return { ok: false, error: 'That address belongs to the platform. Enter your own domain.' }
  }

  return { ok: true, domain }
}

/** The TXT record that proves `domain`'s DNS owner chose the store holding `token`. */
export function ownershipChallenge(domain: string, token: string): OwnershipChallenge {
  return { name: `${OWNERSHIP_LABEL}.${domain}`, value: `${OWNERSHIP_PREFIX}${token}` }
}

/** `order.shop.com` under apex `shop.com` → `order`; the apex itself → `@`. */
export function hostLabel(recordDomain: string, apexName: string): string {
  if (recordDomain === apexName) return '@'
  const suffix = `.${apexName}`
  return recordDomain.endsWith(suffix) ? recordDomain.slice(0, -suffix.length) : recordDomain
}

export interface DnsPlanInput {
  domain: string
  apexName: string
  recommendedIPv4: string | null
  recommendedCNAME: string | null
  /** Vercel's own TXT challenges (usually only when another account knew the domain). */
  verification: VerificationChallenge[]
  /** This store's proof record; null once the domain is proven. */
  ownership: OwnershipChallenge | null
}

/**
 * The records the owner must create. An apex cannot hold a CNAME, so it gets
 * the A record plus a `www` CNAME (served as a redirect to the apex); a
 * subdomain gets one CNAME. Then the store's ownership TXT while the claim is
 * unproven, and any TXT challenge Vercel itself asks for.
 */
export function buildDnsRecords(input: DnsPlanInput): DnsRecord[] {
  const cname = input.recommendedCNAME ?? DEFAULT_VERCEL_CNAME
  const isApex = input.domain === input.apexName

  const routing: DnsRecord[] = isApex
    ? [
        { type: 'A', host: '@', value: input.recommendedIPv4 ?? DEFAULT_VERCEL_IPV4, purpose: 'routing' },
        { type: 'CNAME', host: 'www', value: cname, purpose: 'www' },
      ]
    : [{ type: 'CNAME', host: hostLabel(input.domain, input.apexName), value: cname, purpose: 'routing' }]

  const ownership: DnsRecord[] = input.ownership
    ? [{ type: 'TXT', host: hostLabel(input.ownership.name, input.apexName), value: input.ownership.value, purpose: 'ownership' }]
    : []

  const challenges: DnsRecord[] = input.verification
    .filter((challenge) => challenge.type.toUpperCase() === 'TXT')
    .map((challenge) => ({
      type: 'TXT',
      host: hostLabel(challenge.domain, input.apexName),
      value: challenge.value,
      purpose: 'verification',
    }))

  return [...routing, ...ownership, ...challenges]
}

/** Whether a claim has sat unproven long enough for another store to take it. */
export function isClaimStale(claimedAt: string | null, now: number): boolean {
  if (!claimedAt) return false
  const claimedAtMs = Date.parse(claimedAt)
  return Number.isFinite(claimedAtMs) && now - claimedAtMs > PENDING_CLAIM_TTL_MS
}
