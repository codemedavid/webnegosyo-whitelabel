import { createClient } from '@supabase/supabase-js'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'
import { normalizeDomain } from '@/lib/tenant-host'
import { createLogger } from '@/lib/logger'

/**
 * The custom-domain directory: every active tenant's custom domain, loaded
 * in ONE small query and shared by every host this runtime serves.
 *
 * It replaces a per-host `tenants WHERE domain = $host` lookup (plus a second
 * for the `www.` variant, plus three caches to remember hits, misses and
 * errors). That lookup ran ~2 million times and was the largest
 * statement-timeout victim of the 2026-09-20/21 database stall, with the
 * middleware — and so the whole site — waiting behind it.
 *
 * Behaviour under a stalled database is the point of the design:
 * - a load that fails keeps the previous directory in service (stale beats
 *   "no tenant" for a merchant's own domain);
 * - a failed load is not retried for `retryMs`, so a struggling database
 *   sees at most one query per runtime per interval, not one per request;
 * - concurrent lookups share one in-flight load.
 *
 * The directory lives per runtime instance (each edge isolate and each lambda
 * has its own), so a change to a tenant's domain propagates within `ttlMs`
 * everywhere; `invalidate()` only shortens that for the instance calling it.
 */

export interface DomainRow {
  slug: string
  domain: string | null
}

export type LoadDomainRows = () => Promise<DomainRow[]>

export interface DomainDirectoryOptions {
  /** How long a loaded directory is served before being refreshed. */
  ttlMs?: number
  /** How long a failed load blocks the next attempt. */
  retryMs?: number
}

export interface DomainDirectory {
  /** The slug owning `host`, or null when the host is not a known custom domain. */
  lookup(host: string): Promise<string | null>
  /** Force the next lookup to reload, e.g. after a tenant's domain changed. */
  invalidate(): void
}

export const DOMAIN_DIRECTORY_TTL_MS = 5 * 60 * 1000
export const DOMAIN_DIRECTORY_RETRY_MS = 10 * 1000
/** The middleware must answer within Vercel's 25s cap; give up well before. */
const DIRECTORY_FETCH_TIMEOUT_MS = 3000

const log = createLogger('[Tenant Domains]', 'DEBUG_TENANT_RESOLUTION')

/**
 * Domain → slug. The query is unordered, so a domain two tenants both claim
 * would resolve to whichever row came last — a different store per load. Such
 * a domain maps to NOBODY (and is logged, never gated) until the conflict is
 * fixed: serving no store is recoverable, serving the wrong one is not.
 */
function indexRows(rows: DomainRow[]): ReadonlyMap<string, string> {
  const claimants = new Map<string, ReadonlySet<string>>()
  for (const { slug, domain } of rows) {
    const key = normalizeDomain(domain)
    if (!key) continue
    claimants.set(key, new Set([...(claimants.get(key) ?? []), slug]))
  }

  const entries: Array<readonly [string, string]> = []
  for (const [domain, slugs] of claimants) {
    if (slugs.size === 1) {
      entries.push([domain, [...slugs][0]] as const)
      continue
    }
    log.error('Custom domain claimed by more than one tenant; resolving it to none', {
      domain,
      slugs: [...slugs].sort(),
    })
  }
  return new Map(entries)
}

export function createDomainDirectory(loadRows: LoadDomainRows, options: DomainDirectoryOptions = {}): DomainDirectory {
  const ttlMs = options.ttlMs ?? DOMAIN_DIRECTORY_TTL_MS
  const retryMs = options.retryMs ?? DOMAIN_DIRECTORY_RETRY_MS

  let entries: ReadonlyMap<string, string> | null = null
  let freshUntil = 0
  let retryAfter = 0
  let inflight: Promise<void> | null = null

  async function reload(): Promise<void> {
    try {
      entries = indexRows(await loadRows())
      freshUntil = Date.now() + ttlMs
      retryAfter = 0
      log.debug('Directory loaded', { domains: entries.size })
    } catch (error) {
      retryAfter = Date.now() + retryMs
      log.debug('Directory load failed; serving the previous directory', {
        error: error instanceof Error ? error.message : String(error),
        hasPrevious: entries !== null,
      })
    }
  }

  async function ensureFresh(): Promise<void> {
    const now = Date.now()
    if (entries && now < freshUntil) return
    if (now < retryAfter) return
    if (!inflight) {
      inflight = reload().finally(() => {
        inflight = null
      })
    }
    await inflight
  }

  return {
    async lookup(host) {
      const key = normalizeDomain(host.split(':')[0])
      if (!key) return null
      await ensureFresh()
      return entries?.get(key) ?? null
    },
    invalidate() {
      freshUntil = 0
      retryAfter = 0
    },
  }
}

/**
 * The production loader: anonymous, session-less, with a fetch that gives up.
 * RLS shows anon only active tenants; the filter is repeated for clarity.
 */
async function loadActiveCustomDomains(): Promise<DomainRow[]> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // postgrest-js retries 503/520 with Retry-After sleeps (default on). One
    // 15s Retry-After is enough to blow Vercel's 25s middleware budget.
    db: { retry: false },
    global: { fetch: createTimedFetch(DIRECTORY_FETCH_TIMEOUT_MS) },
  })

  const { data, error } = await supabase
    .from('tenants')
    .select('slug, domain')
    .eq('is_active', true)
    .not('domain', 'is', null)

  if (error) throw new Error(error.message)
  return (data ?? []) as DomainRow[]
}

/** The directory every request-path resolver shares within this runtime. */
export const domainDirectory = createDomainDirectory(loadActiveCustomDomains)
