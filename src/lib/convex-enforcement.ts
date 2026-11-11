/**
 * The decisions behind `scripts/convex-enforcement.ts`, the operator's tool for
 * turning `auth_enforced` on store by store.
 *
 * Kept free of Supabase and Convex clients so they can be tested: the script
 * supplies the I/O through `EnforcementDeps`. The rule throughout is that no
 * order may stop, so a store is only enforced once its deployment can honour
 * it, the refusal is proved straight afterwards, and anything short of that
 * puts the flag back and says so.
 *
 * The probe is anonymous and reports one word. Nothing a deployment answers
 * ever leaves this module, because an open deployment answers with an order.
 */

import { resolveOrderBackend, type OrderBackend, type OrderBackendPreference } from '@/lib/order-backend'
import type { ConvexConfigSyncResult } from '@/lib/convex-config-sync'

export type ProbeResult = 'open' | 'refused' | 'down'

/** The first template with the gate at all. */
export const MIN_ENFORCEABLE_SCHEMA_VERSION = 28
/** The first template whose refusals survive production's error redaction. */
export const NAMED_REFUSAL_SCHEMA_VERSION = 40

const PROBE_TIMEOUT_MS = 10_000
export const DEFAULT_AUDIT_DAYS = 7

interface ProbeBody {
  status?: unknown
  errorMessage?: unknown
  errorData?: unknown
}

/** Wording of a deployment that cannot run the probe, whatever else it says. */
const CANNOT_ANSWER = /Could not find|ArgumentValidationError|is not in the validator/
/** Production's redaction of a plain Error: the request id and nothing more. */
const BARE_REDACTION = /Server Error\s*$/

/**
 * What one anonymous `orders:getOrders` means.
 *
 * Before v40 the gate threw a plain Error, which a production deployment
 * redacts to a bare "Server Error", so that reads as refused too: nothing else
 * in `getOrders` throws. `planEnforce` covers the one way that can be wrong, a
 * soft store that fails this query for some other reason.
 */
export function classifyProbeResponse(httpStatus: number, body: unknown): ProbeResult {
  if (!body || typeof body !== 'object') return 'down'
  const { status, errorMessage, errorData } = body as ProbeBody
  if (status === 'success') return httpStatus < 300 ? 'open' : 'down'
  if (status !== 'error') return 'down'

  const reason = `${typeof errorData === 'string' ? errorData : ''} ${typeof errorMessage === 'string' ? errorMessage : ''}`
  if (reason.includes('Unauthorized')) return 'refused'
  if (CANNOT_ANSWER.test(reason)) return 'down'
  return BARE_REDACTION.test(reason) ? 'refused' : 'down'
}

export async function probeAnonymously(
  deploymentUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  try {
    const response = await fetchImpl(`${deploymentUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'orders:getOrders', args: { limit: 1 }, format: 'json' }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return classifyProbeResponse(response.status, await response.json())
  } catch {
    return 'down'
  }
}

/** What the database says about a store, for the decisions below. */
export interface EnforceTarget {
  slug: string
  /** Both a deployment URL and a deploy key are on file. */
  hasDeployment: boolean
  deployedVersion: string | null
  authEnforced: boolean
  publicReads: boolean
}

export type EnforcePlan = { proceed: true; notes: string[] } | { proceed: false; reason: string }

/** `convex_schema_version` is TEXT; anything unreadable counts as never deployed. */
function readVersion(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function planEnforce(target: EnforceTarget, probe: ProbeResult): EnforcePlan {
  if (!target.hasDeployment) return { proceed: false, reason: 'no Convex deployment or deploy key on file' }

  const version = readVersion(target.deployedVersion)
  if (version === null || version < MIN_ENFORCEABLE_SCHEMA_VERSION) {
    return {
      proceed: false,
      reason: `deployed version v${target.deployedVersion ?? '?'} is below v${MIN_ENFORCEABLE_SCHEMA_VERSION}; deploy first`,
    }
  }
  if (probe === 'down') return { proceed: false, reason: 'deployment is down' }
  if (probe === 'refused' && !target.authEnforced) {
    // Either a config sync that never reached the database, or a query failing
    // for a reason that production redacted. Worth a person either way.
    return {
      proceed: false,
      reason: 'deployment already refuses while the flag is off; check it, or run rollback first',
    }
  }

  return {
    proceed: true,
    notes: [
      ...(version < NAMED_REFUSAL_SCHEMA_VERSION
        ? [`on v${version}: refusals are redacted and createOrder is only gated for POS until v${NAMED_REFUSAL_SCHEMA_VERSION}`]
        : []),
      ...(target.publicReads ? ['stays public for reads (convex_public_reads)'] : []),
    ],
  }
}

/** A public-read store is meant to answer an anonymous read; its writes are the gate. */
export function verifyEnforced(probe: ProbeResult, publicReads: boolean): boolean {
  return publicReads ? probe !== 'down' : probe === 'refused'
}

export interface EnforcementDeps {
  /** Anonymous probe of the store's own deployment. */
  probe: () => Promise<ProbeResult>
  /** Write `convex_auth_enforced`; throws unless the row really changed. */
  setFlag: (enforced: boolean) => Promise<void>
  /** Push the store's config to its deployment. */
  sync: () => Promise<ConvexConfigSyncResult>
  /**
   * Admitted writes that carried no token, from the deployment's own counter
   * (v40+). Null when it has no counter yet. Those callers would start failing.
   */
  tokenlessWrites?: () => Promise<number | null>
}

export interface StoreResult {
  ok: boolean
  detail: string
  notes: string[]
}

function syncFailure(result: ConvexConfigSyncResult): string | null {
  if (result.status === 'synced') return null
  return result.status === 'failed' ? result.error : result.reason
}

/** Put the flag back after a failed enforce. Worded for the operator's log line. */
async function revert(target: EnforceTarget, deps: EnforcementDeps): Promise<string> {
  // A store enforced before this run stays enforced: a re-sync that failed has
  // not made it any less so, and flipping it would open it.
  if (target.authEnforced) return 'left enforced as it was'
  try {
    await deps.setFlag(false)
    const failure = syncFailure(await deps.sync())
    if (failure) return `flag reverted, but the deployment may still be enforcing (${failure}); run rollback`
    return `flag reverted; deployment now ${await deps.probe()}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `could not revert (${message}); the deployment may still be enforcing, run rollback`
  }
}

export async function enforceStore(
  target: EnforceTarget,
  deps: EnforcementDeps,
  options: { dryRun?: boolean; force?: boolean } = {}
): Promise<StoreResult> {
  const before = target.hasDeployment ? await deps.probe() : 'down'
  const plan = planEnforce(target, before)
  if (!plan.proceed) return { ok: false, detail: `refused: ${plan.reason}`, notes: [] }
  const notes = [...plan.notes]

  const tokenless = deps.tokenlessWrites ? await deps.tokenlessWrites() : null
  if (tokenless === null) notes.push('no tokenless-write count from this deployment; old builds not measured')
  if (tokenless && !options.force) {
    return { ok: false, detail: `refused: ${tokenless} tokenless writes recently; update those devices or pass --force`, notes }
  }
  if (options.dryRun) return { ok: true, detail: `would enforce (now ${before})`, notes }

  try {
    await deps.setFlag(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, detail: `flag not written, nothing changed: ${message}`, notes }
  }

  const failure = syncFailure(await deps.sync())
  if (failure) {
    return { ok: false, detail: `sync failed (${failure}); ${await revert(target, deps)}`, notes }
  }

  const after = await deps.probe()
  if (!verifyEnforced(after, target.publicReads)) {
    const state = after === 'open' ? 'still open' : after
    return { ok: false, detail: `synced but ${state}; ${await revert(target, deps)}`, notes }
  }
  return { ok: true, detail: `enforced (probe: ${after})`, notes }
}

export async function rollbackStore(
  target: EnforceTarget,
  deps: EnforcementDeps,
  options: { dryRun?: boolean } = {}
): Promise<StoreResult> {
  if (!target.hasDeployment) return { ok: false, detail: 'no Convex deployment or deploy key on file', notes: [] }
  if (options.dryRun) return { ok: true, detail: 'would roll back', notes: [] }

  try {
    await deps.setFlag(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, detail: `flag not written, nothing changed: ${message}`, notes: [] }
  }

  const failure = syncFailure(await deps.sync())
  if (failure) {
    return { ok: false, detail: `flag cleared, but the deployment may still be enforcing: ${failure}`, notes: [] }
  }
  const after = await deps.probe()
  return after === 'open'
    ? { ok: true, detail: 'rolled back (probe: open)', notes: [] }
    : { ok: false, detail: `flag cleared and synced, but probe says ${after}`, notes: [] }
}

export function parseTenantList(value: string | null | undefined): string[] {
  const slugs = (value ?? '').split(',').map((slug) => slug.trim()).filter(Boolean)
  return [...new Set(slugs)]
}

export type StoreSelector =
  | { kind: 'all' }
  | { kind: 'backend'; backend: OrderBackend }
  | { kind: 'tenants'; slugs: string[] }

export type EnforcementCommand = 'status' | 'enforce' | 'rollback' | 'audit'

export interface EnforcementArgs {
  command: EnforcementCommand
  selector: StoreSelector
  dryRun: boolean
  force: boolean
  days: number
}

const COMMANDS: readonly EnforcementCommand[] = ['status', 'enforce', 'rollback', 'audit']
const BACKENDS: readonly OrderBackend[] = ['platform', 'convex']

export function parseEnforcementArgs(argv: readonly string[]): EnforcementArgs | { error: string } {
  const [command, ...rest] = argv
  if (!COMMANDS.includes(command as EnforcementCommand)) {
    return { error: `Expected one of: ${COMMANDS.join(', ')}` }
  }
  const valueAfter = (flag: string): string | null => {
    const at = rest.indexOf(flag)
    return at >= 0 ? (rest[at + 1] ?? '') : null
  }

  const tenants = valueAfter('--tenants')
  const backend = valueAfter('--backend')
  // Only `status` looks at the whole fleet. Everything else names its stores,
  // so a stage rollout can never widen by a mistyped flag.
  if (command !== 'status' && tenants === null) return { error: `${command} needs --tenants a,b,c` }
  if (backend !== null && !BACKENDS.includes(backend as OrderBackend)) {
    return { error: `--backend must be one of: ${BACKENDS.join(', ')}` }
  }

  let selector: StoreSelector = { kind: 'all' }
  if (tenants !== null) {
    const slugs = parseTenantList(tenants)
    if (slugs.length === 0) return { error: '--tenants names no stores' }
    selector = { kind: 'tenants', slugs }
  } else if (backend !== null) {
    selector = { kind: 'backend', backend: backend as OrderBackend }
  }

  const daysValue = valueAfter('--days')
  const days = daysValue === null ? DEFAULT_AUDIT_DAYS : Number(daysValue)
  if (!Number.isInteger(days) || days < 1) return { error: '--days must be a positive whole number' }

  return { command: command as EnforcementCommand, selector, dryRun: rest.includes('--dry-run'), force: rest.includes('--force'), days }
}

export interface SelectableStore {
  slug: string
  order_backend?: OrderBackendPreference | null
  convex_deployment_url?: string | null
}

export function selectStores<T extends SelectableStore>(
  rows: readonly T[],
  selector: StoreSelector
): { selected: T[]; unknownSlugs: string[] } {
  if (selector.kind === 'tenants') {
    const known = new Set(rows.map((row) => row.slug))
    return {
      selected: rows.filter((row) => selector.slugs.includes(row.slug)),
      unknownSlugs: selector.slugs.filter((slug) => !known.has(slug)),
    }
  }
  const deployed = rows.filter((row) => Boolean(row.convex_deployment_url))
  return {
    selected:
      selector.kind === 'backend'
        ? deployed.filter((row) => resolveOrderBackend(row) === selector.backend)
        : deployed,
    unknownSlugs: [],
  }
}

/** Scrub known secret values from text bound for a terminal or a log. */
export function redactSecrets(text: string, secrets: ReadonlyArray<string | null | undefined>): string {
  return secrets.reduce<string>(
    (scrubbed, secret) => (secret ? scrubbed.split(secret).join('[redacted]') : scrubbed),
    text
  )
}
