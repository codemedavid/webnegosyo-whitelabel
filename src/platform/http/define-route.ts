/**
 * `defineRoute`: the one way into an API route.
 *
 *   export const POST = defineRoute({
 *     auth: { kind: 'staff', permission: 'inventory', branch: 'own' },
 *     rateLimit: { bucket: 'stock-count', per: 'user', max: 30, window: '1m' },
 *     body: z.object({ … }),
 *     handler: async ({ tenant, user, body }) => NextResponse.json(…),
 *   })
 *
 * The declaration says who may call (see `entry.ts`), how often, and what the
 * input looks like; the handler runs only after all three held. The checks
 * themselves are the app's existing helpers (`access.ts`).
 *
 * ORDER, and why:
 *   1. `public`: the rate limit, by address, before anything is read.
 *   2. `cron` / `device` / `signature`: the credential (a signature is checked
 *      over the raw body), then the rate limit.
 *   3. Input: `params`, `query`, `body` against their schemas → 400.
 *   4. `staff` / `superadmin`: caller, store, feature, branch → 401 / 403,
 *      then the rate limit → 429. Input comes first here because the store a
 *      request names is part of it, and the access check is what decides that
 *      claim; it is also the order the hand-written routes already answer in.
 *   5. The handler. Anything it throws → 500 with a fixed sentence; the error
 *      goes to the log and Sentry, never into the response.
 *
 * `tenant` is the caller's own store, or a store the request named AND the
 * access check admitted. It is never read from the input on trust.
 *
 * A cookie session and a Bearer token both work for `kind: 'staff'` (the
 * pipeline runs inside `withRequestBearer`); `session: 'bearer'` keeps a route
 * to the merchant app's token only.
 */

import type { NextRequest } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import type { z } from 'zod'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import {
  resolveCronAccess,
  resolveDeviceAccess,
  resolveSignatureAccess,
  type AccessRefusal,
  type AccessResult,
  type RateSubject,
} from './access'
import {
  assertValidDeclaration,
  attachEntry,
  summarizeEntry,
  type CallerOf,
  type EntrySummary,
  type RateLimitDeclaration,
  type Refusal,
  type RouteAuth,
} from './entry'
import { countRouteRequest } from './rate-limit'
import { defaultRefusalResponse } from './refusal-response'
import { routeRefusal } from './refusals'
import { reportFailure, traceRefusal } from './report'

/** Dynamic segments, as Next hands them to a route handler. */
export type RouteParams = Record<string, string | string[] | undefined>

export interface RouteInput<TBody, TQuery, TParams> {
  /** The JSON body after its schema; `undefined` when the route declares none. */
  body: TBody
  /** The query string after its schema (first value per key); `undefined` when none is declared. */
  query: TQuery
  params: TParams
}

export type RouteContext<TAuth, TBody, TQuery, TParams> = RouteInput<TBody, TQuery, TParams> &
  CallerOf<TAuth> & { request: NextRequest }

/** A public entry has to say how it is limited; every other kind may. */
export type RateLimitField<TAuth> = TAuth extends { kind: 'public' }
  ? { rateLimit: RateLimitDeclaration }
  : { rateLimit?: RateLimitDeclaration }

export type RouteDeclaration<TAuth, TBody, TQuery, TParams> = {
  auth: TAuth
  body?: z.ZodType<TBody>
  query?: z.ZodType<TQuery>
  params?: z.ZodType<TParams>
  /**
   * Word a refusal the way this route always has (an older app build parses
   * it). Return nothing to keep the default for that code.
   */
  onRefusal?: (refusal: Refusal, request: NextRequest) => Response | undefined
  handler: (context: RouteContext<TAuth, TBody, TQuery, TParams>) => Response | Promise<Response>
} & RateLimitField<TAuth>

export interface RouteHandlerContext {
  params: Promise<RouteParams>
}

/**
 * Callable the way Next calls it (request + context) and the way unit tests
 * do (request alone). Two signatures rather than one optional parameter:
 * Next's generated route types read the last one and expect a context.
 */
export interface RouteHandler {
  (request: NextRequest): Promise<Response>
  (request: NextRequest, context: RouteHandlerContext): Promise<Response>
}

type AnyDeclaration = RouteDeclaration<RouteAuth<RouteInput<unknown, unknown, unknown>>, unknown, unknown, unknown> & {
  rateLimit?: RateLimitDeclaration
}

type ParsedInput =
  | { ok: true; value: RouteInput<unknown, unknown, unknown> }
  | { ok: false; issues: z.core.$ZodIssue[] }

/** The first value of each key, as `searchParams.get` reads it. */
function queryObject(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams
  const query: Record<string, string> = {}
  for (const key of new Set(params.keys())) query[key] = params.get(key) as string
  return query
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readInput(
  declaration: AnyDeclaration,
  request: NextRequest,
  context: RouteHandlerContext | undefined,
  rawBody: string | undefined,
): Promise<ParsedInput> {
  const value: RouteInput<unknown, unknown, unknown> = {
    body: undefined,
    query: undefined,
    params: (await context?.params) ?? {},
  }

  if (declaration.params) {
    const parsed = declaration.params.safeParse(value.params)
    if (!parsed.success) return { ok: false, issues: parsed.error.issues }
    value.params = parsed.data
  }
  if (declaration.query) {
    const parsed = declaration.query.safeParse(queryObject(request))
    if (!parsed.success) return { ok: false, issues: parsed.error.issues }
    value.query = parsed.data
  }
  if (declaration.body) {
    // A body that is not JSON reads as null and fails the schema like any other bad input.
    const json = rawBody === undefined ? await request.json().catch(() => null) : parseJson(rawBody)
    const parsed = declaration.body.safeParse(json)
    if (!parsed.success) return { ok: false, issues: parsed.error.issues }
    value.body = parsed.data
  }
  return { ok: true, value }
}

function validatedParts(declaration: AnyDeclaration): EntrySummary['validates'] {
  const parts = ['body', 'query', 'params'] as const
  return parts.filter((part) => declaration[part] !== undefined)
}

async function run(
  declaration: AnyDeclaration,
  request: NextRequest,
  context: RouteHandlerContext | undefined,
  refuse: (refusal: AccessRefusal, extras?: Pick<Refusal, 'issues' | 'retryAfterSec'>) => Response,
): Promise<Response> {
  const { auth, rateLimit } = declaration
  let caller: object = {}
  let rawBody: string | undefined

  const count = async (subject: RateSubject): Promise<Response | null> => {
    const verdict = await countRouteRequest(rateLimit, request, subject)
    return verdict.allowed ? null : refuse({ code: 'rate-limited' }, { retryAfterSec: verdict.retryAfterSec })
  }
  const admit = async (access: AccessResult<unknown>): Promise<Response | null> => {
    if (!access.ok) return refuse(access.refusal)
    caller = access.caller as object
    return count(access.subject)
  }

  if (auth.kind === 'public') {
    const limited = await count({})
    if (limited) return limited
  }
  if (auth.kind === 'cron') {
    const refused = await admit(resolveCronAccess(request))
    if (refused) return refused
  }
  if (auth.kind === 'device') {
    const refused = await admit(await resolveDeviceAccess(request, auth))
    if (refused) return refused
  }
  if (auth.kind === 'signature') {
    rawBody = await request.text()
    const refused = await admit(await resolveSignatureAccess(request, auth, rawBody))
    if (refused) return refused
  }

  const input = await readInput(declaration, request, context, rawBody)
  if (!input.ok) return refuse({ code: 'invalid' }, { issues: input.issues })

  // Loaded here, not at the top: only an entry with a signed-in caller needs the admin stack.
  if (auth.kind === 'staff') {
    const { resolveStaffAccess } = await import('./access-session')
    const refused = await admit(await resolveStaffAccess(request, auth, input.value))
    if (refused) return refused
  }
  if (auth.kind === 'superadmin') {
    const { resolveConsoleAccess } = await import('./access-session')
    const refused = await admit(await resolveConsoleAccess(auth))
    if (refused) return refused
  }

  // Descriptors, not a spread: the caller's lazy fields stay lazy.
  const handlerContext = Object.defineProperties(
    { request, ...input.value },
    Object.getOwnPropertyDescriptors(caller),
  )
  return declaration.handler(handlerContext as never)
}

export function defineRoute<
  TBody = undefined,
  TQuery = undefined,
  TParams = RouteParams,
  const TAuth extends RouteAuth<RouteInput<TBody, TQuery, TParams>> = RouteAuth<RouteInput<TBody, TQuery, TParams>>,
>(declaration: RouteDeclaration<TAuth, TBody, TQuery, TParams>): RouteHandler {
  const declared = declaration as unknown as AnyDeclaration
  assertValidDeclaration('defineRoute', declared)
  const { auth } = declared

  const handle = async (request: NextRequest, context?: RouteHandlerContext): Promise<Response> => {
    const entry = `${request.method} ${new URL(request.url).pathname}`
    const refuse = (refusal: AccessRefusal, extras: Pick<Refusal, 'issues' | 'retryAfterSec'> = {}): Response => {
      const worded = routeRefusal(auth.kind, refusal, extras)
      traceRefusal({ surface: 'route', entry }, worded.code, worded.status)
      return declared.onRefusal?.(worded, request) ?? refusal.response ?? defaultRefusalResponse(auth.kind, worded)
    }
    try {
      return await run(declared, request, context, refuse)
    } catch (error) {
      // redirect(), notFound() and Next's render bail-outs travel as throws: let them through.
      unstable_rethrow(error)
      reportFailure(error, { surface: 'route', entry })
      return refuse({ code: 'error' })
    }
  }

  // A staff route that is not Bearer-only serves the web admin's cookie and the
  // app's token alike: inside withRequestBearer, createClient() acts as the token's user.
  const acceptsBearerSession = auth.kind === 'staff' && auth.session !== 'bearer'
  const route = (request: NextRequest, context?: RouteHandlerContext): Promise<Response> =>
    acceptsBearerSession ? withRequestBearer(request, () => handle(request, context)) : handle(request, context)

  return attachEntry(route as RouteHandler, summarizeEntry('route', declared, validatedParts(declared)))
}
