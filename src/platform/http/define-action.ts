/**
 * `defineAction`: the one way into a server action.
 *
 *   // in a 'use server' file
 *   export const saveThingAction = defineAction({
 *     auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([input]) => input.tenantId },
 *     args: [z.object({ tenantId: z.string().uuid(), name: z.string().min(1) })],
 *     handler: async ({ tenant, args: [input] }) => ({ success: true as const, data: … }),
 *   })
 *
 * A server action is a public POST endpoint: a browser can call it with any
 * arguments, whatever the page that imports it checks. So it declares the
 * same three things a route does (who, how often, what the input looks like)
 * and the handler runs only after they held.
 *
 * - This file is NOT `'use server'`: such a file may only export async
 *   functions, so the helper lives here and the action file exports its result
 *   (which is an async function).
 * - `args` is one schema per positional argument and is required, so "this
 *   argument is not validated" is a visible `z.custom<T>()`, not an absence.
 *   Extra arguments a caller sends are dropped.
 * - The result follows the shape most actions already return,
 *   `{ success: true, … } | { success: false, error }`: the handler returns
 *   its own result and a refusal is `{ success: false, error: <safe sentence> }`,
 *   so the action's type is the handler's result OR that failure. An action
 *   with another shape (or wording of its own) supplies `onRefusal`, and its
 *   type is the handler's result OR whatever `onRefusal` returns.
 * - Order: `public` rate limit → `args` → caller, store, feature, branch →
 *   rate limit → handler (the same order as `defineRoute`, for the same reason).
 * - A thrown error becomes the `error` refusal: logged and reported, never
 *   returned. `redirect()` / `notFound()` still work (they are re-thrown).
 */

import { unstable_rethrow } from 'next/navigation'
import type { z } from 'zod'
import type { AccessRefusal, AccessResult, RateSubject } from './access'
import {
  assertValidDeclaration,
  attachEntry,
  summarizeEntry,
  type ActionAuth,
  type CallerOf,
  type RateLimitDeclaration,
  type Refusal,
} from './entry'
import type { RateLimitField } from './define-route'
import { countActionCall } from './rate-limit'
import { actionRefusal } from './refusals'
import { reportFailure, traceRefusal } from './report'

/** One schema per positional argument of the action. */
export type ActionArgSchemas<TArgs extends unknown[]> = { [Index in keyof TArgs]: z.ZodType<TArgs[Index]> }

export type ActionContext<TAuth, TArgs> = CallerOf<TAuth> & {
  /** The arguments after their schemas. */
  args: TArgs
}

/** The failure half of the shape most actions return. */
export interface ActionFailure {
  success: false
  error: string
}

export type ActionDeclaration<TAuth, TArgs extends unknown[], TResult, TRefused> = {
  auth: TAuth
  args: ActionArgSchemas<TArgs>
  /** Word a refusal in this action's own shape. Left out: `{ success: false, error }`. */
  onRefusal?: (refusal: Refusal) => TRefused
  handler: (context: ActionContext<TAuth, TArgs>) => TResult | Promise<TResult>
} & RateLimitField<TAuth>

interface AnyActionDeclaration {
  auth: ActionAuth<unknown[]>
  args: readonly z.ZodType[]
  rateLimit?: RateLimitDeclaration
  onRefusal?: (refusal: Refusal) => unknown
  handler: (context: never) => unknown
}

type ParsedArgs = { ok: true; value: unknown[] } | { ok: false; issues: z.core.$ZodIssue[] }

function parseArgs(schemas: readonly z.ZodType[], args: readonly unknown[]): ParsedArgs {
  const value: unknown[] = []
  for (const [index, schema] of schemas.entries()) {
    const parsed = schema.safeParse(args[index])
    if (!parsed.success) return { ok: false, issues: parsed.error.issues }
    value.push(parsed.data)
  }
  return { ok: true, value }
}

async function run(
  declaration: AnyActionDeclaration,
  args: readonly unknown[],
  refuse: (refusal: AccessRefusal, extras?: Pick<Refusal, 'issues' | 'retryAfterSec'>) => unknown,
): Promise<unknown> {
  const { auth, rateLimit } = declaration
  let caller: object = {}

  const count = async (subject: RateSubject): Promise<{ refused: unknown } | null> => {
    const verdict = await countActionCall(rateLimit, subject)
    return verdict.allowed ? null : { refused: refuse({ code: 'rate-limited' }, { retryAfterSec: verdict.retryAfterSec }) }
  }
  const admit = async (access: AccessResult<unknown>): Promise<{ refused: unknown } | null> => {
    if (!access.ok) return { refused: refuse(access.refusal) }
    caller = access.caller as object
    return count(access.subject)
  }

  if (auth.kind === 'public') {
    const limited = await count({})
    if (limited) return limited.refused
  }

  const parsed = parseArgs(declaration.args, args)
  if (!parsed.ok) return refuse({ code: 'invalid' }, { issues: parsed.issues })

  // Loaded here, not at the top: a public action (checkout) never needs the admin stack.
  if (auth.kind === 'staff') {
    const { resolveStaffAccess } = await import('./access-session')
    const refused = await admit(await resolveStaffAccess(null, auth, parsed.value))
    if (refused) return refused.refused
  }
  if (auth.kind === 'superadmin') {
    const { resolveConsoleAccess } = await import('./access-session')
    const refused = await admit(await resolveConsoleAccess(auth))
    if (refused) return refused.refused
  }

  // Descriptors, not a spread: the caller's lazy fields stay lazy.
  const handlerContext = Object.defineProperties({ args: parsed.value }, Object.getOwnPropertyDescriptors(caller))
  return declaration.handler(handlerContext as never)
}

export function defineAction<
  TArgs extends unknown[],
  TResult,
  TRefused = ActionFailure,
  const TAuth extends ActionAuth<TArgs> = ActionAuth<TArgs>,
>(declaration: ActionDeclaration<TAuth, TArgs, TResult, TRefused>): (...args: TArgs) => Promise<TResult | TRefused> {
  const declared = declaration as unknown as AnyActionDeclaration
  assertValidDeclaration('defineAction', declared)
  const context = { surface: 'action' as const, entry: `${declared.auth.kind} action` }

  const refuse = (refusal: AccessRefusal, extras: Pick<Refusal, 'issues' | 'retryAfterSec'> = {}): unknown => {
    const worded = actionRefusal(refusal, extras)
    traceRefusal(context, worded.code, worded.status)
    if (declared.onRefusal) return declared.onRefusal(worded)
    const failure: ActionFailure = { success: false, error: worded.message }
    return failure
  }

  // An `async function`, because that is what a 'use server' file may export.
  async function action(...args: TArgs): Promise<TResult | TRefused> {
    try {
      return (await run(declared, args, refuse)) as TResult | TRefused
    } catch (error) {
      // redirect(), notFound() and Next's render bail-outs travel as throws: let them through.
      unstable_rethrow(error)
      reportFailure(error, context)
      return refuse({ code: 'error' }) as TRefused
    }
  }

  return attachEntry(action, summarizeEntry('action', declared, ['args']))
}
