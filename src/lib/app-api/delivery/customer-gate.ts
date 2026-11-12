import 'server-only'
import type { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { resolveCustomerSession } from '@/lib/customer-auth/account'
import { appFail } from '@/lib/app-api/respond'
import type { AppRouteContext } from '@/lib/app-api/app-route'

/**
 * Address search and delivery quotes spend shared, billable quota (Apple Maps,
 * road distance, the store's own Lalamove account), so they are for a
 * signed-in customer of THIS store, within a per-customer burst and daily
 * budget on top of appRoute's per-IP limit.
 */

export interface CustomerBudgets {
  /** Rate-limit key prefix, e.g. `app-places`. */
  bucket: string
  burst: Pick<RateLimitOptions, 'limit' | 'windowSec'>
  daily: Pick<RateLimitOptions, 'limit' | 'windowSec'>
}

export type CustomerGate =
  | { ok: true; customerId: string; /** The session's token hash, for RPCs that re-check the session themselves. */ tokenHash: string }
  | { ok: false; response: NextResponse }

export const SIGNED_OUT_MESSAGE = 'Please sign in again.'

export async function gateAppCustomer({ request, app }: AppRouteContext, budgets: CustomerBudgets): Promise<CustomerGate> {
  const session = await resolveCustomerSession(request.headers, app.tenantId)
  if (!session) return { ok: false, response: appFail('unauthorized', SIGNED_OUT_MESSAGE) }

  const who = `${app.tenantId}:${session.customerId}`
  for (const [key, budget] of [
    [`${budgets.bucket}:${who}`, budgets.burst],
    [`${budgets.bucket}-day:${who}`, budgets.daily],
  ] as const) {
    const verdict = await checkRateLimit(key, { ...budget, onRedisFailure: 'instance' })
    if (!verdict.allowed) {
      return {
        ok: false,
        response: appFail('rate_limited', 'Too many requests. Please wait a moment and try again.', {
          retryAfterSec: verdict.retryAfterSec,
        }),
      }
    }
  }
  return { ok: true, customerId: session.customerId, tokenHash: session.tokenHash }
}
