/**
 * The shared gate for the merchant app's map routes (`/api/maps/places`,
 * `/api/maps/snapshot`): a signed-in member of the store, within their own
 * per-person limits, with Apple Maps configured on this deploy.
 *
 * Every call spends the team's Apple Maps quota (shared with every storefront's
 * address field), which is why each person gets a burst AND a daily budget.
 */

import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { readMapKitConfig, type MapKitConfig } from '@/lib/maps/apple/mapkit-token'

export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export const latLngSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
})

interface Budget {
  limit: number
  windowSec: number
}

export interface AppMapsBudgets {
  /** Rate-limit key prefix, e.g. `maps-places`. */
  bucket: string
  burst: Budget
  daily: Budget
  /** Refuse (503) on a deploy without Apple Maps keys. Default true. */
  requiresAppleMaps?: boolean
  /** Apple calls this request will make; each one is counted. Default 1. */
  units?: number
}

export type AppMapsGate =
  | { ok: true; config: MapKitConfig | null; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

export function mapsFail(status: number, error: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } })
}

/** One counter step per Apple call; stops at the first refusal. */
async function chargeUnits(key: string, budget: Budget, units: number) {
  let verdict = await checkRateLimit(key, { ...budget, onRedisFailure: 'instance' })
  for (let unit = 1; unit < units && verdict.allowed; unit += 1) {
    verdict = await checkRateLimit(key, { ...budget, onRedisFailure: 'instance' })
  }
  return verdict
}

export async function gateAppMapsRequest(
  request: Request,
  tenantId: string,
  budgets: AppMapsBudgets,
): Promise<AppMapsGate> {
  const caller = await requireBearerStoreCaller(request, tenantId, 'view')
  if (!caller.ok) return { ok: false, response: caller.response }

  const config = readMapKitConfig()
  if (!config && budgets.requiresAppleMaps !== false) {
    return { ok: false, response: mapsFail(503, 'Maps are not available right now.') }
  }

  const userId = caller.user.id
  const units = Math.max(1, Math.floor(budgets.units ?? 1))
  for (const [key, budget] of [
    [`${budgets.bucket}:${userId}`, budgets.burst],
    [`${budgets.bucket}-day:${userId}`, budgets.daily],
  ] as const) {
    const verdict = await chargeUnits(key, budget, units)
    if (!verdict.allowed) {
      return {
        ok: false,
        response: mapsFail(429, 'Too many map searches. Try again in a moment.', {
          'Retry-After': String(verdict.retryAfterSec),
        }),
      }
    }
  }

  return { ok: true, config, supabase: caller.supabase }
}
