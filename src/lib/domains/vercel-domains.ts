/**
 * Minimal Vercel Domains REST client for the one project that serves every
 * storefront. Every call returns a result — a Vercel outage must surface as a
 * message on the owner's screen, never as an unhandled throw.
 *
 * Docs: https://vercel.com/docs/rest-api (projects/*domains*, domains/config)
 */

import type { VerificationChallenge } from '@/lib/domains/domain-plan'

export interface VercelDomainsConfig {
  token: string
  projectId: string
  teamId: string | null
}

export interface ProjectDomain {
  name: string
  apexName: string
  verified: boolean
  verification: VerificationChallenge[]
}

export interface DomainConfig {
  /** True until DNS points here AND Vercel can issue the certificate. */
  misconfigured: boolean
  recommendedIPv4: string | null
  recommendedCNAME: string | null
}

export type VercelResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string }

export interface VercelDomainsClient {
  /** Attach `name` to the project; `redirectTo` makes it a 308 alias. */
  addDomain(name: string, redirectTo?: string): Promise<VercelResult<ProjectDomain>>
  getDomain(name: string): Promise<VercelResult<ProjectDomain>>
  verifyDomain(name: string): Promise<VercelResult<ProjectDomain>>
  /** Detach `name`; a domain that is already gone counts as success. */
  removeDomain(name: string): Promise<VercelResult<null>>
  getConfig(name: string): Promise<VercelResult<DomainConfig>>
}

const API_BASE = 'https://api.vercel.com'
const REQUEST_TIMEOUT_MS = 10_000
const PERMANENT_REDIRECT = 308

type FetchLike = (input: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response>

/** Null until the platform is configured; custom domains are then unavailable. */
export function readVercelDomainsConfig(
  env: Record<string, string | undefined> = process.env,
): VercelDomainsConfig | null {
  const token = env.VERCEL_API_TOKEN?.trim()
  const projectId = env.VERCEL_PROJECT_ID?.trim()
  if (!token || !projectId) return null
  return { token, projectId, teamId: env.VERCEL_TEAM_ID?.trim() || null }
}

function toProjectDomain(body: Record<string, unknown>): ProjectDomain {
  return {
    name: String(body.name ?? ''),
    apexName: String(body.apexName ?? body.name ?? ''),
    verified: body.verified === true,
    verification: Array.isArray(body.verification) ? (body.verification as VerificationChallenge[]) : [],
  }
}

function rankOne<T extends { rank?: number; value?: unknown }>(entries: unknown): T | null {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return [...(entries as T[])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0] ?? null
}

function toDomainConfig(body: Record<string, unknown>): DomainConfig {
  const ipv4 = rankOne<{ rank?: number; value?: string[] }>(body.recommendedIPv4)
  const cname = rankOne<{ rank?: number; value?: string }>(body.recommendedCNAME)
  return {
    misconfigured: body.misconfigured !== false,
    recommendedIPv4: ipv4?.value?.[0] ?? null,
    recommendedCNAME: cname?.value ? cname.value.replace(/\.$/, '') : null,
  }
}

export function createVercelDomainsClient(
  config: VercelDomainsConfig,
  fetchImpl: FetchLike = fetch as FetchLike,
): VercelDomainsClient {
  const projectPath = `/projects/${encodeURIComponent(config.projectId)}/domains`

  function url(path: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ ...(config.teamId ? { teamId: config.teamId } : {}), ...extra })
    const query = params.toString()
    return `${API_BASE}${path}${query ? `?${query}` : ''}`
  }

  async function request<T>(
    method: string,
    target: string,
    parse: (body: Record<string, unknown>) => T,
    body?: unknown,
  ): Promise<VercelResult<T>> {
    let response: Response
    try {
      response = await fetchImpl(target, {
        method,
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return {
        ok: false,
        status: 0,
        code: 'network_error',
        message: error instanceof Error ? error.message : String(error),
      }
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      const error = (json.error ?? {}) as { code?: string; message?: string }
      return {
        ok: false,
        status: response.status,
        code: error.code ?? `http_${response.status}`,
        message: error.message ?? `Vercel responded ${response.status}`,
      }
    }
    return { ok: true, data: parse(json) }
  }

  const domainPath = (name: string) => `${projectPath}/${encodeURIComponent(name)}`

  return {
    addDomain(name, redirectTo) {
      const payload = redirectTo
        ? { name, redirect: redirectTo, redirectStatusCode: PERMANENT_REDIRECT }
        : { name }
      return request('POST', url(`/v10${projectPath}`), toProjectDomain, payload)
    },
    getDomain(name) {
      return request('GET', url(`/v9${domainPath(name)}`), toProjectDomain)
    },
    verifyDomain(name) {
      return request('POST', url(`/v9${domainPath(name)}/verify`), toProjectDomain)
    },
    async removeDomain(name) {
      const result = await request('DELETE', url(`/v9${domainPath(name)}`), () => null)
      if (!result.ok && result.status === 404) return { ok: true, data: null }
      return result
    },
    getConfig(name) {
      return request(
        'GET',
        url(`/v6/domains/${encodeURIComponent(name)}/config`, { projectIdOrName: config.projectId }),
        toDomainConfig,
      )
    },
  }
}
