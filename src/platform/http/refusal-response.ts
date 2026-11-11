/**
 * The HTTP response for a refusal when the route does not word its own.
 * Kept apart from `refusals.ts` so `defineAction` never loads `next/server`.
 */

import { NextResponse } from 'next/server'
import type { AuthKind, Refusal } from './entry'

/** Kinds whose credential is a secret in the request: their answers are never cached. */
const SECRET_KINDS: readonly AuthKind[] = ['cron', 'device', 'signature']

/**
 * One dialect per kind, each the one its hand-written routes already speak:
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
