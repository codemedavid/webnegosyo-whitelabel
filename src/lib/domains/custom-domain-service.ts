/**
 * Connect, check and disconnect a store's custom domain.
 *
 * Every storefront is served by ONE Vercel project, so "DNS points at us"
 * proves only that the domain's owner chose the platform — not which store.
 * A claim therefore lives in `pending_domain` (never routed) until:
 *
 *   1. the owner publishes this claim's token as a TXT record
 *      (`_webnegosyo.<domain>`), proving the DNS owner chose THIS store, and
 *   2. Vercel has verified the domain for the project,
 *
 * and only then moves into `tenants.domain`, the one column the middleware's
 * domain directory routes on. Without step 1, a churned merchant's domain
 * that still points here could be claimed and served by any other store.
 *
 * No cron: status refreshes when the card is open, and an unproven claim is
 * released lazily after `PENDING_CLAIM_TTL_MS` when another store asks for it.
 * Dependencies are injected; `src/app/actions/custom-domain.ts` wires them.
 */

import {
  buildDnsRecords,
  isClaimStale,
  ownershipChallenge,
  parseCustomDomainInput,
  type CustomDomainStatus,
  type DnsRecord,
} from '@/lib/domains/domain-plan'
import type { TxtLookup } from '@/lib/domains/txt-lookup'
import type { DomainConfig, ProjectDomain, VercelDomainsClient, VercelResult } from '@/lib/domains/vercel-domains'

export interface TenantDomainRow {
  id: string
  slug: string
  /** Proven and routed. */
  domain: string | null
  /** Claimed, not yet proven; never routed. */
  pendingDomain: string | null
  pendingToken: string | null
  pendingClaimedAt: string | null
  domainVerifiedAt: string | null
}

export type DomainPatch = Partial<Omit<TenantDomainRow, 'id' | 'slug'>>

export type StoreWriteResult = { ok: true } | { ok: false; isConflict: boolean; message: string }

export interface DomainStore {
  getTenant(tenantId: string): Promise<TenantDomainRow | null>
  /** Another store holding `domain`, routed or pending. */
  findHolder(domain: string, excludeTenantId: string): Promise<TenantDomainRow | null>
  update(tenantId: string, patch: DomainPatch): Promise<StoreWriteResult>
}

export interface CustomDomainView {
  domain: string | null
  status: CustomDomainStatus | null
  /** DNS resolves here and Vercel can serve TLS — visitors actually arrive. */
  isDnsReady: boolean
  verifiedAt: string | null
  records: DnsRecord[]
}

export type CustomDomainResult =
  | { ok: true; view: CustomDomainView; isRoutingChanged: boolean }
  | { ok: false; error: string }

export interface CustomDomainServiceDeps {
  store: DomainStore
  vercel: VercelDomainsClient
  lookupTxt: TxtLookup
  now: () => number
  createToken: () => string
  rootDomain: string | null
}

const EMPTY_VIEW: CustomDomainView = { domain: null, status: null, isDnsReady: false, verifiedAt: null, records: [] }
const CLEARED_CLAIM: DomainPatch = { pendingDomain: null, pendingToken: null, pendingClaimedAt: null }
const TAKEN_ERROR = 'This domain is already connected to another store.'
const UNREACHABLE_ERROR = 'Could not reach the domain service. Please try again in a moment.'
const SAVE_ERROR = 'The domain could not be saved. Please try again.'

type Failure = { ok: false; error: string }
type Inspection = { ok: true; project: ProjectDomain; config: DomainConfig }

function vercelError(result: Extract<VercelResult<unknown>, { ok: false }>): Failure {
  if (result.status === 409) {
    return {
      ok: false,
      error: 'This domain is connected to another Vercel account or project. Remove it there first, then try again.',
    }
  }
  if (result.status === 0 || result.status >= 500) return { ok: false, error: UNREACHABLE_ERROR }
  return { ok: false, error: `The domain could not be added: ${result.message}` }
}

function unchanged(view: CustomDomainView): CustomDomainResult {
  return { ok: true, view, isRoutingChanged: false }
}

export function createCustomDomainService(deps: CustomDomainServiceDeps) {
  const { store, vercel, lookupTxt, now, createToken, rootDomain } = deps
  const nowIso = () => new Date(now()).toISOString()

  /** Attach to the project, adopting a domain that is already there. */
  async function attach(domain: string): Promise<VercelResult<ProjectDomain>> {
    const added = await vercel.addDomain(domain)
    const attached = added.ok ? added : await vercel.getDomain(domain)
    if (!attached.ok) return added
    // An apex also answers on www as a permanent redirect. Non-fatal: the www
    // record is listed either way.
    if (attached.data.apexName === domain) await vercel.addDomain(`www.${domain}`, domain)
    return attached
  }

  async function inspect(domain: string): Promise<Inspection | Failure> {
    const found = await vercel.getDomain(domain)
    const project = !found.ok && found.status === 404 ? await attach(domain) : found
    if (!project.ok) return vercelError(project)

    let current = project.data
    if (!current.verified) {
      const verified = await vercel.verifyDomain(domain)
      if (verified.ok && verified.data.verified) current = { ...verified.data, verification: [] }
    }

    const config = await vercel.getConfig(domain)
    if (!config.ok) return vercelError(config)
    return { ok: true, project: current, config: config.data }
  }

  function viewOf(
    domain: string,
    status: CustomDomainStatus,
    inspection: Inspection,
    extra: { verifiedAt: string | null; ownershipToken: string | null },
  ): CustomDomainView {
    return {
      domain,
      status,
      isDnsReady: !inspection.config.misconfigured,
      verifiedAt: extra.verifiedAt,
      records: buildDnsRecords({
        domain,
        apexName: inspection.project.apexName || domain,
        recommendedIPv4: inspection.config.recommendedIPv4,
        recommendedCNAME: inspection.config.recommendedCNAME,
        verification: inspection.project.verification,
        ownership: extra.ownershipToken ? ownershipChallenge(domain, extra.ownershipToken) : null,
      }),
    }
  }

  async function refreshActive(tenant: TenantDomainRow, domain: string): Promise<CustomDomainResult> {
    const inspection = await inspect(domain)
    if (!inspection.ok) return inspection
    return unchanged(viewOf(domain, 'active', inspection, { verifiedAt: tenant.domainVerifiedAt, ownershipToken: null }))
  }

  async function isOwnershipProven(domain: string, token: string): Promise<boolean> {
    const expected = ownershipChallenge(domain, token)
    const found = await lookupTxt(expected.name)
    return found.ok && found.values.includes(expected.value)
  }

  /** Check a pending claim; promote it to the routed domain once proven. */
  async function refreshPending(tenant: TenantDomainRow, domain: string, token: string): Promise<CustomDomainResult> {
    const inspection = await inspect(domain)
    if (!inspection.ok) return inspection

    const isProven = inspection.project.verified && (await isOwnershipProven(domain, token))
    if (!isProven) {
      return unchanged(viewOf(domain, 'pending', inspection, { verifiedAt: null, ownershipToken: token }))
    }

    const verifiedAt = nowIso()
    const promoted = await store.update(tenant.id, { ...CLEARED_CLAIM, domain, domainVerifiedAt: verifiedAt })
    if (!promoted.ok) return { ok: false, error: promoted.isConflict ? TAKEN_ERROR : SAVE_ERROR }
    return {
      ok: true,
      view: viewOf(domain, 'active', inspection, { verifiedAt, ownershipToken: null }),
      isRoutingChanged: true,
    }
  }

  async function refresh(tenant: TenantDomainRow): Promise<CustomDomainResult> {
    if (tenant.domain) return refreshActive(tenant, tenant.domain)
    if (tenant.pendingDomain && tenant.pendingToken) {
      return refreshPending(tenant, tenant.pendingDomain, tenant.pendingToken)
    }
    return unchanged(EMPTY_VIEW)
  }

  /** Null when `domain` is free (or a stale claim on it was just released). */
  async function ensureUnclaimed(domain: string, tenantId: string): Promise<Failure | null> {
    const holder = await store.findHolder(domain, tenantId)
    if (!holder) return null
    if (holder.domain === domain || !isClaimStale(holder.pendingClaimedAt, now())) {
      return { ok: false, error: TAKEN_ERROR }
    }
    // An unproven claim never routed, so releasing it cannot move live traffic.
    const released = await store.update(holder.id, CLEARED_CLAIM)
    return released.ok ? null : { ok: false, error: TAKEN_ERROR }
  }

  async function claim(tenant: TenantDomainRow, domain: string): Promise<CustomDomainResult> {
    const refusal = await ensureUnclaimed(domain, tenant.id)
    if (refusal) return refusal

    const attached = await attach(domain)
    if (!attached.ok) return vercelError(attached)

    const pending = { pendingDomain: domain, pendingToken: createToken(), pendingClaimedAt: nowIso() }
    const saved = await store.update(tenant.id, pending)
    if (!saved.ok) return { ok: false, error: saved.isConflict ? TAKEN_ERROR : SAVE_ERROR }
    return refresh({ ...tenant, ...pending })
  }

  /** Detach names from Vercel unless another store still holds them. */
  async function detach(domain: string, tenantId: string): Promise<void> {
    if (await store.findHolder(domain, tenantId)) return
    await Promise.all([vercel.removeDomain(`www.${domain}`), vercel.removeDomain(domain)])
  }

  return {
    async connect(tenantId: string, rawDomain: string): Promise<CustomDomainResult> {
      const parsed = parseCustomDomainInput(rawDomain, rootDomain)
      if (!parsed.ok) return parsed

      const tenant = await store.getTenant(tenantId)
      if (!tenant) return { ok: false, error: 'Store not found.' }

      const current = tenant.domain ?? tenant.pendingDomain
      if (current === parsed.domain) return refresh(tenant)
      if (current) return { ok: false, error: `Remove ${current} first, then connect the new domain.` }
      return claim(tenant, parsed.domain)
    },

    async check(tenantId: string): Promise<CustomDomainResult> {
      const tenant = await store.getTenant(tenantId)
      if (!tenant) return { ok: false, error: 'Store not found.' }
      return refresh(tenant)
    },

    async disconnect(tenantId: string): Promise<CustomDomainResult> {
      const tenant = await store.getTenant(tenantId)
      if (!tenant) return { ok: false, error: 'Store not found.' }
      const names = [tenant.domain, tenant.pendingDomain].filter((name): name is string => Boolean(name))
      if (names.length === 0) return unchanged(EMPTY_VIEW)

      // The store row first: once cleared the domain routes nowhere, so a
      // Vercel failure below leaves only a harmless, re-adoptable leftover.
      const cleared = await store.update(tenantId, { ...CLEARED_CLAIM, domain: null, domainVerifiedAt: null })
      if (!cleared.ok) return { ok: false, error: 'The domain could not be removed. Please try again.' }

      await Promise.all(names.map((name) => detach(name, tenantId)))
      return { ok: true, view: EMPTY_VIEW, isRoutingChanged: Boolean(tenant.domain) }
    },
  }
}

export type CustomDomainService = ReturnType<typeof createCustomDomainService>
