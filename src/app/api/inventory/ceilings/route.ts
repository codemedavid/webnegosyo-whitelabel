import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMenuStockAvailability, type OptionStockCeilings } from '@/lib/inventory/menu-ceilings'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

/**
 * GET /api/inventory/ceilings?tenantId=…&outletId=…
 *
 * How many of each dish the kitchen can currently make, so a quantity stepper
 * can stop where the shelf does instead of letting a customer discover it at
 * the last screen of checkout.
 *
 * WHY THIS IS UNAUTHENTICATED, AND WHY THAT IS SAFE.
 * A diner has no account, so this cannot be gated on a session — the same
 * position `/api/inventory/customer-order-stock` is in. It is guarded by
 * carrying nothing steerable and returning nothing private: the caller names a
 * tenant and optionally a branch, and what comes back is one integer per dish,
 * which is precisely what the storefront is about to render to that diner
 * anyway — plus, per dish, one integer per recipe-tracked option
 * (`optionCeilings`), so a choice that cannot be made reads as sold out. No
 * ingredient, cost, supplier, recipe or stock quantity crosses this boundary.
 * Untracked dishes are simply absent.
 *
 * Open is not the same as unbounded. Every call reads a store's whole stock
 * graph (recipes, components, shelves, units) on the database every store
 * shares, so ids are validated before anything is read and each address gets
 * a per-store allowance counted in Redis (a cold lambda must not reset it; a
 * Redis outage falls back to the per-instance count, never to no limit). The
 * allowance is far above what a diner's menu (30-second refresh) or a register
 * (one read per change of dishes in the sale) ever needs.
 *
 * A failed read is never an error response. A stepper that cannot load its cap
 * falls back to uncapped — exactly how it behaved before this existed — and
 * checkout remains the authoritative refusal either way. A broken menu would be
 * a far worse outcome than an uncapped one. Callers treat any non-OK answer,
 * a 400 or 429 included, the same way.
 */

const querySchema = z.object({
  tenantId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
})

const RATE_LIMIT: RateLimitOptions = { limit: 120, windowSec: 60, onRedisFailure: 'instance' }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    tenantId: request.nextUrl.searchParams.get('tenantId'),
    outletId: request.nextUrl.searchParams.get('outletId') || null,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'tenantId (and outletId, if given) must be ids' }, { status: 400 })
  }
  const { tenantId, outletId } = parsed.data

  const ip = getClientIP(request) ?? 'unknown'
  const rate = await checkRateLimit(`stock-ceilings:${ip}:${tenantId}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  // A ceiling is stale the moment the next order lands, so nothing may hold
  // onto one. A cached "3 left" outliving its stock is the exact failure this
  // whole feature exists to prevent.
  const headers = { 'Cache-Control': 'no-store' }

  try {
    const { dishes, options } = await getMenuStockAvailability(tenantId, outletId)
    return NextResponse.json(
      { ceilings: Object.fromEntries(dishes), optionCeilings: toJsonOptionCeilings(options) },
      { headers },
    )
  } catch (error) {
    console.error('[inventory] Ceilings read failed', tenantId, error)
    return NextResponse.json({ ceilings: {}, optionCeilings: {} }, { headers })
  }
}

function toJsonOptionCeilings(options: OptionStockCeilings): Record<string, Record<string, number>> {
  return Object.fromEntries([...options].map(([menuItemId, byOption]) => [menuItemId, Object.fromEntries(byOption)]))
}
