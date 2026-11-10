/**
 * How a refusal is worded, per surface.
 *
 * The access layer answers with a code. A route turns it into a status and a
 * JSON body in the dialect that kind of route already speaks (so the merchant
 * app and the console keep parsing what they parse today); a server action
 * turns it into the `{ success: false, error }` its caller shows to a person.
 * Every sentence here is safe to show: none is built from an error message.
 */

import { NextResponse } from 'next/server'
import { SUBSCRIPTION_PAUSED_MESSAGE } from '@/lib/billing/subscription-gate'
import type { AccessRefusal } from './access'
import type { AuthKind, Refusal, RefusalCode, RefusalStatus } from './entry'

const STATUS: Record<RefusalCode, RefusalStatus> = {
  unauthenticated: 401,
  'not-member': 403,
  permission: 403,
  branch: 403,
  subscription: 403,
  invalid: 400,
  'rate-limited': 429,
  unavailable: 500,
  error: 500,
}

const FAILED = 'Something went wrong. Please try again.'

/** The `{ error }` bodies the Bearer routes already answer with (`bearer-caller.ts`). */
const ROUTE_MESSAGES: Record<RefusalCode, string> = {
  unauthenticated: 'Unauthorized',
  'not-member': 'Forbidden',
  permission: 'Forbidden',
  branch: 'Forbidden',
  subscription: SUBSCRIPTION_PAUSED_MESSAGE,
  invalid: 'Invalid request',
  'rate-limited': 'Too many requests',
  unavailable: FAILED,
  error: FAILED,
}

/** What `platformPermissionResponse` says (`platform-staff/guard.ts`); a parity test pins the pair. */
const CONSOLE_MESSAGES: Partial<Record<RefusalCode, string>> = {
  unauthenticated: 'Not authenticated',
  'not-member': 'You do not have access to do this',
}

/** A person reads these, so they are sentences. */
const ACTION_MESSAGES: Record<RefusalCode, string> = {
  unauthenticated: 'Please sign in again.',
  'not-member': 'You do not have access to this store.',
  permission: 'You do not have permission for this.',
  branch: 'You can only act for your own branch.',
  subscription: SUBSCRIPTION_PAUSED_MESSAGE,
  invalid: 'Check the details and try again.',
  'rate-limited': 'Too many attempts. Please try again in a moment.',
  unavailable: FAILED,
  error: FAILED,
}

type RefusalExtras = Pick<Refusal, 'issues' | 'retryAfterSec'>

function build(messages: Partial<Record<RefusalCode, string>>, fallback: Record<RefusalCode, string>, refusal: AccessRefusal, extras: RefusalExtras): Refusal {
  return {
    code: refusal.code,
    status: STATUS[refusal.code],
    message: refusal.message ?? messages[refusal.code] ?? fallback[refusal.code],
    ...extras,
  }
}

export function routeRefusal(kind: AuthKind, refusal: AccessRefusal, extras: RefusalExtras = {}): Refusal {
  return build(kind === 'superadmin' ? CONSOLE_MESSAGES : ROUTE_MESSAGES, ROUTE_MESSAGES, refusal, extras)
}

export function actionRefusal(refusal: AccessRefusal, extras: RefusalExtras = {}): Refusal {
  return build(ACTION_MESSAGES, ACTION_MESSAGES, refusal, extras)
}

/** Kinds whose credential is a secret in the request: their answers are never cached. */
const SECRET_KINDS: readonly AuthKind[] = ['cron', 'device', 'signature']

/**
 * The response for a refusal when the route does not word its own.
 * - superadmin: the console envelope `{ success, data, error }`, private and uncached;
 * - cron / device / signature: `{ error }`, `Cache-Control: no-store`;
 * - staff / public: `{ error }`.
 */
export function defaultRefusalResponse(kind: AuthKind, refusal: Refusal): Response {
  const headers: Record<string, string> = {}
  if (kind === 'superadmin') headers['Cache-Control'] = 'private, no-store'
  if (SECRET_KINDS.includes(kind)) headers['Cache-Control'] = 'no-store'
  if (refusal.retryAfterSec !== undefined) headers['Retry-After'] = String(refusal.retryAfterSec)

  const body = kind === 'superadmin'
    ? { success: false, data: null, error: refusal.message }
    : { error: refusal.message }
  const hasHeaders = Object.keys(headers).length > 0
  return NextResponse.json(body, hasHeaders ? { status: refusal.status, headers } : { status: refusal.status })
}
