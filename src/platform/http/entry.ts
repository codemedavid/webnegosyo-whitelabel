/**
 * What an entry point declares about itself, as data.
 *
 * Every API route and server action is a public URL: a browser, the merchant
 * app or a script can call it with any arguments. Each one used to open with
 * its own hand-written prologue (who is calling, which store, which feature,
 * which branch, how often), and a prologue that forgot a line still compiled.
 *
 * `defineRoute` / `defineAction` take the same questions as a declaration, so
 * "any member of the store may call this" or "no rate limit" is a literal
 * somebody typed and a reviewer can grep for, never a missing line. The
 * declaration also rides on the exported function (`describeEntry`) and is
 * read from source by `scripts/generate-entry-points.mjs`, which writes the
 * table of every entry point, who may call it and its limit.
 *
 * Types and pure helpers only: no I/O, so both wrappers and their tests share it.
 */

import type { z } from 'zod'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { RedisFailureMode } from '@/lib/distributed-rate-limit'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import type { PlatformAction, PlatformPermission } from '@/lib/platform-staff/permissions'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

/**
 * The feature a staff caller must hold: one key, any one of several keys, or
 * the literal `'any-staff'` for "membership of the store is enough". There is
 * no default, so membership-only is always a visible choice.
 */
export type StaffPermission = StaffPermissionKey | readonly StaffPermissionKey[] | 'any-staff'

/**
 * How the caller's branch limits the call. Stated on every staff entry:
 * - `'own'`: acts for the caller's own branch. A branch-locked account is held
 *   to it (and refused when it names another); a store-wide account may name
 *   any branch of the store, or none.
 * - `'store-wide'`: only accounts that are not locked to a branch.
 * - `'any'`: the branch does not limit this call.
 */
export type BranchRule = 'own' | 'store-wide' | 'any'

export interface StaffAuth<TInput> {
  kind: 'staff'
  permission: StaffPermission
  branch: BranchRule
  /**
   * The verb a platform-staff account needs under `stores.*`. A store's own
   * accounts ignore it. Defaults to `'edit'`, as `verifyTenantAdmin` does, so
   * a read must say `'view'`.
   */
  access?: PlatformAction
  /**
   * `'bearer'`: the merchant app's token only (`requireBearerStoreCaller`).
   * Left out: a cookie session, or a Bearer token through `withRequestBearer`
   * (`verifyTenantAdmin`, which also applies the subscription gate).
   */
  session?: 'bearer'
  /**
   * The store the request NAMES. It is only ever a claim: the existing access
   * check decides it, so a store account passes for its own store and nothing
   * else, and a console account (which has no store of its own) passes for the
   * stores its grants cover. Left out: the store is the caller's own account's.
   */
  storeClaim?: (input: TInput) => string
  /** The branch the request names, for `branch: 'own'`. Checked, never trusted. */
  branchClaim?: (input: TInput) => string | null | undefined
}

export interface SuperadminAuth {
  kind: 'superadmin'
  /** A console grant, or `'full-superadmin'` for what no staff grant can open. */
  permission: PlatformPermission | 'full-superadmin'
}

/** No caller check at all. A public entry must state its rate limit. */
export interface PublicAuth {
  kind: 'public'
}

/** `Authorization: Bearer $CRON_SECRET`, as the Vercel cron sends it. */
export interface CronAuth {
  kind: 'cron'
}

/** A device credential (an enrolled phone). `verify` returns the device, or null to refuse. */
export interface DeviceAuth<TDevice> {
  kind: 'device'
  /** Names the credential in the entry-point table, e.g. `'sms gateway device'`. */
  scheme: string
  verify: (request: Request) => TDevice | null | Promise<TDevice | null>
}

/** A signed request (a webhook). `verify` sees the raw body before it is parsed. */
export interface SignatureAuth {
  kind: 'signature'
  /** Names the signature in the entry-point table, e.g. `'facebook x-hub-signature-256'`. */
  scheme: string
  verify: (request: Request, rawBody: string) => boolean | Promise<boolean>
}

export type RouteAuth<TInput, TDevice = unknown> =
  | StaffAuth<TInput>
  | SuperadminAuth
  | PublicAuth
  | CronAuth
  | DeviceAuth<TDevice>
  | SignatureAuth

/** A server action has no Request: no Bearer-only, cron, device or signature callers. */
export type ActionAuth<TInput> = Omit<StaffAuth<TInput>, 'session'> | SuperadminAuth | PublicAuth

export type AuthKind = RouteAuth<unknown>['kind']

/** `'30s'`, `'1m'`, `'1h'`, `'1d'`. */
export type RateLimitWindow = `${number}${'s' | 'm' | 'h' | 'd'}`

export interface RateLimitRule {
  /** Names the counter. Stable: renaming it resets everyone's count. */
  bucket: string
  /** Counted per client address, per signed-in person, or per store. */
  per: 'ip' | 'user' | 'store'
  max: number
  window: RateLimitWindow
  /** What a Redis outage does; see `distributed-rate-limit.ts`. Default: allow. */
  onRedisFailure?: RedisFailureMode
}

/** "No limit" said out loud, with the reason it is safe. */
export interface NoRateLimit {
  per: 'none'
  reason: string
}

export type RateLimitDeclaration = RateLimitRule | NoRateLimit

/** Why a call was turned away before (or instead of) its handler. */
export type RefusalCode =
  /** No valid session, token, secret or signature. */
  | 'unauthenticated'
  /** Signed in, but not for this store (or lacking the console grant). */
  | 'not-member'
  /** A member of the store without the feature. */
  | 'permission'
  /** The caller's branch does not allow it. */
  | 'branch'
  /** The store's subscription is paused. */
  | 'subscription'
  /** The input failed its schema. */
  | 'invalid'
  | 'rate-limited'
  /** The access check itself could not be completed. Never treated as "allowed". */
  | 'unavailable'
  /** The handler threw. */
  | 'error'

export type RefusalStatus = 400 | 401 | 403 | 429 | 500

export interface Refusal {
  code: RefusalCode
  status: RefusalStatus
  /** Safe to show the caller: never an internal error message. */
  message: string
  /** `invalid` only: what the schema rejected. */
  issues?: z.core.$ZodIssue[]
  /** `rate-limited` only. */
  retryAfterSec?: number
}

/** What a `kind: 'staff'` handler is given. Nothing here was read from the request's input on trust. */
export interface StaffCaller {
  /** The store this call acts on: the caller's own, or a named store the access check admitted. */
  tenant: string
  user: User
  appUser: AppUserScopeRow
  /** The branch the caller's account is confined to, if any. */
  branch: BranchScope
  /**
   * The branch this call acts for under `branch: 'own'`: a branch-locked
   * account's own branch, else the checked `branchClaim` (null = whole store).
   */
  outletId: string | null
  /** A client that acts AS the caller, so RLS applies to everything it reads and writes. */
  callerClient: () => Promise<SupabaseClient>
}

export interface ConsoleCallerContext {
  user: { id: string; email?: string | null }
  appUser: AppUserScopeRow
}

export interface DeviceCallerContext<TDevice> {
  device: TDevice
}

/** The caller fields a handler receives, by the kind of entry it declared. */
export type CallerOf<TAuth> = TAuth extends { kind: 'staff' }
  ? StaffCaller
  : TAuth extends { kind: 'superadmin' }
    ? ConsoleCallerContext
    : TAuth extends DeviceAuth<infer TDevice>
      ? DeviceCallerContext<TDevice>
      : unknown

/** The declaration as plain data: what `describeEntry` returns and the table is built from. */
export interface EntrySummary {
  type: 'route' | 'action'
  auth: {
    kind: AuthKind
    permission?: string | readonly string[]
    branch?: BranchRule
    access?: PlatformAction
    session?: 'bearer' | 'cookie-or-bearer' | 'cookie'
    scheme?: string
    /** Whether the request names its store (checked) rather than using the caller's own. */
    namesStore?: boolean
  }
  rateLimit: RateLimitDeclaration | null
  validates: readonly ('body' | 'query' | 'params' | 'args')[]
}

const ENTRY_KEY = '__entry'

/** Hang the declaration on the exported function, out of sight of enumeration and JSON. */
export function attachEntry<TFunction extends object>(target: TFunction, summary: EntrySummary): TFunction {
  Object.defineProperty(target, ENTRY_KEY, { value: Object.freeze(summary), enumerable: false })
  return target
}

/** The declaration of a `defineRoute` / `defineAction` export, or null for anything else. */
export function describeEntry(candidate: unknown): EntrySummary | null {
  if (typeof candidate !== 'function') return null
  const summary = (candidate as { [ENTRY_KEY]?: EntrySummary })[ENTRY_KEY]
  return summary ?? null
}

const WINDOW_UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 }
const WINDOW_PATTERN = /^(\d+)([smhd])$/

/** `'1m'` → 60. Throws on anything else: a typo must fail the build, not disable a limit. */
export function windowSeconds(window: string): number {
  const match = WINDOW_PATTERN.exec(window)
  const seconds = match ? Number(match[1]) * WINDOW_UNIT_SECONDS[match[2]] : 0
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`rateLimit.window "${window}" is not a duration like '30s', '1m', '1h' or '1d'`)
  }
  return seconds
}

interface DeclarationShape {
  auth: { kind: string; permission?: unknown; branch?: unknown; session?: unknown; scheme?: unknown; verify?: unknown; branchClaim?: unknown }
  rateLimit?: RateLimitDeclaration
}

const BRANCH_RULES: readonly string[] = ['own', 'store-wide', 'any']
/** Kinds that resolve a signed-in person, so a per-person or per-store counter has a subject. */
const KINDS_WITH_USER: readonly string[] = ['staff', 'superadmin']

/**
 * Refuse a declaration the types could be argued past (a cast, a plain-JS
 * caller). Runs once when the module loads, so a bad declaration fails the
 * build and every test that imports the file, not the first request.
 */
export function assertValidDeclaration(wrapper: 'defineRoute' | 'defineAction', declaration: DeclarationShape): void {
  const { auth, rateLimit } = declaration
  const fail = (problem: string): never => {
    throw new Error(`${wrapper}: ${problem}`)
  }

  if (auth.kind === 'staff') {
    const { permission, branch } = auth
    const isKeyList = Array.isArray(permission) && permission.length > 0
    if (typeof permission !== 'string' && !isKeyList) {
      fail("a staff entry must name its permission key, or say permission: 'any-staff'")
    }
    if (typeof branch !== 'string' || !BRANCH_RULES.includes(branch)) {
      fail("a staff entry must say branch: 'own', 'store-wide' or 'any'")
    }
    if (auth.branchClaim !== undefined && branch !== 'own') {
      fail("branchClaim only applies to branch: 'own'")
    }
    if (wrapper === 'defineAction' && auth.session !== undefined) {
      fail('a server action has no Request, so it cannot be Bearer-only')
    }
  }
  if (auth.kind === 'superadmin' && typeof auth.permission !== 'string') {
    fail("a superadmin entry must name its console grant, or say permission: 'full-superadmin'")
  }
  if ((auth.kind === 'device' || auth.kind === 'signature') && (typeof auth.verify !== 'function' || typeof auth.scheme !== 'string')) {
    fail(`a ${auth.kind} entry needs its verify function and a scheme name`)
  }
  if (wrapper === 'defineAction' && !['staff', 'superadmin', 'public'].includes(auth.kind)) {
    fail(`a server action cannot be kind: '${auth.kind}'`)
  }

  if (auth.kind === 'public' && rateLimit === undefined) {
    fail("a public entry must state a rateLimit, or { per: 'none', reason } saying why none is safe")
  }
  if (rateLimit === undefined) return
  if (rateLimit.per === 'none') {
    if (typeof rateLimit.reason !== 'string' || rateLimit.reason.trim() === '') fail("rateLimit { per: 'none' } needs a reason")
    return
  }
  if (!rateLimit.bucket) fail('rateLimit needs a bucket name')
  if (!Number.isInteger(rateLimit.max) || rateLimit.max <= 0) fail('rateLimit.max must be a positive whole number')
  windowSeconds(rateLimit.window)
  if (rateLimit.per !== 'ip' && !KINDS_WITH_USER.includes(auth.kind)) {
    fail(`a ${auth.kind} entry has no signed-in person: rateLimit.per must be 'ip'`)
  }
  if (rateLimit.per === 'store' && auth.kind !== 'staff') fail("rateLimit.per 'store' needs a staff entry")
}

/** The declaration reduced to data (functions and schemas become flags). */
export function summarizeEntry(
  type: EntrySummary['type'],
  declaration: DeclarationShape & { auth: { access?: PlatformAction; storeClaim?: unknown } },
  validates: EntrySummary['validates'],
): EntrySummary {
  const { auth } = declaration
  const summary: EntrySummary['auth'] = { kind: auth.kind as AuthKind }
  if (auth.kind === 'staff') {
    summary.permission = auth.permission as string | readonly string[]
    summary.branch = auth.branch as BranchRule
    summary.access = auth.access ?? 'edit'
    summary.session = auth.session === 'bearer' ? 'bearer' : type === 'action' ? 'cookie' : 'cookie-or-bearer'
    summary.namesStore = typeof auth.storeClaim === 'function'
  }
  if (auth.kind === 'superadmin') {
    summary.permission = auth.permission as string
    summary.session = 'cookie'
  }
  if (auth.kind === 'device' || auth.kind === 'signature') summary.scheme = auth.scheme as string
  return { type, auth: summary, rateLimit: declaration.rateLimit ?? null, validates }
}
