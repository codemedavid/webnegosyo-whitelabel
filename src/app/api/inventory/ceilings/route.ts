import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readThroughCeilingsCache } from '@/lib/inventory/ceilings-cache'
import { getMenuStockAvailability, type OptionStockCeilings } from '@/lib/inventory/menu-ceilings'
import { DEFAULT_POS_STOCK_POLICY, readPosStockPolicy } from '@/lib/inventory/pos-stock-policy'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { readBearerToken } from '@/lib/supabase/bearer-session'

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
 * (one read per change of dishes in the sale) ever needs. A busy shop's diners
 * and its register share one Wi-Fi address, so a register that sends its
 * signed-in member's Bearer token is counted per PERSON instead; a token that
 * is not a member of this store is counted by address, like any diner.
 * Verifying a token costs a GoTrue round trip and an app_users read, so a
 * request carrying one is first counted by ADDRESS in its own, store-agnostic
 * bucket (`stock-ceilings:verify:<ip>` — apart from the diners' allowance, so
 * a busy dining room never starves the register) and only then verified.
 *
 * A failed read is never an error response. A stepper that cannot load its cap
 * falls back to uncapped — exactly how it behaved before this existed — and
 * checkout remains the authoritative refusal either way. A broken menu would be
 * a far worse outcome than an uncapped one. Callers treat any non-OK answer,
 * a 400 or 429 included, the same way.
 *
 * `stockPolicy` ('warn' | 'block', `tenants.pos_stock_policy`) tells the
 * register what to do when a sale asks for more than a ceiling: warn the
 * cashier (default) or only let a manager/owner sign-in sell past it. It is 'warn' whenever the
 * ceilings could not be read — there is nothing to hold a sale against.
 */

const querySchema = z.object({
  tenantId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
})

const RATE_LIMIT: RateLimitOptions = { limit: 120, windowSec: 60, onRedisFailure: 'instance' }
/** Token verifications per address per minute: several registers on one Wi-Fi, each one read per change. */
const VERIFY_RATE_LIMIT: RateLimitOptions = { limit: 600, windowSec: 60, onRedisFailure: 'instance' }

function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
}

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
  const hasToken = readBearerToken(request.headers.get('authorization')) !== null
  if (hasToken) {
    const verify = await checkRateLimit(`stock-ceilings:verify:${ip}`, VERIFY_RATE_LIMIT)
    if (!verify.allowed) return tooMany(verify.retryAfterSec)
  }

  const key = (hasToken ? await memberKey(request, tenantId) : null) ?? `stock-ceilings:${ip}:${tenantId}`
  const rate = await checkRateLimit(key, RATE_LIMIT)
  if (!rate.allowed) return tooMany(rate.retryAfterSec)

  // No browser or CDN may hold a ceiling: it is stale the moment the next
  // order lands. Diners' reads share a few-second server cache that every
  // sale and stock movement drops (`ceilings-cache.ts`); the register, whose
  // `block` policy holds a sale against these numbers, always reads fresh.
  const headers = { 'Cache-Control': 'no-store' }

  try {
    const body = hasToken
      ? await readCeilingsBody(tenantId, outletId)
      : await readThroughCeilingsCache(tenantId, outletId, () => readCeilingsBody(tenantId, outletId))
    return NextResponse.json(body, { headers })
  } catch (error) {
    console.error('[inventory] Ceilings read failed', tenantId, error)
    return NextResponse.json({ ceilings: {}, optionCeilings: {}, stockPolicy: DEFAULT_POS_STOCK_POLICY }, { headers })
  }
}

interface CeilingsBody {
  ceilings: Record<string, number>
  optionCeilings: Record<string, Record<string, number>>
  stockPolicy: Awaited<ReturnType<typeof readPosStockPolicy>>
}

async function readCeilingsBody(tenantId: string, outletId: string | null): Promise<CeilingsBody> {
  // Read alongside the graph; readPosStockPolicy never throws (warn on failure).
  const policyRead = readPosStockPolicy(tenantId)
  const { dishes, options } = await getMenuStockAvailability(tenantId, outletId)
  return {
    ceilings: Object.fromEntries(dishes),
    optionCeilings: toJsonOptionCeilings(options),
    stockPolicy: await policyRead,
  }
}

/** The per-person key when the token proves a member of this store; null = count by address. */
async function memberKey(request: NextRequest, tenantId: string): Promise<string | null> {
  try {
    const { requireBearerStoreCaller } = await import('@/lib/auth/bearer-caller')
    const caller = await requireBearerStoreCaller(request, tenantId, 'view')
    return caller.ok ? `stock-ceilings:user:${caller.user.id}:${tenantId}` : null
  } catch (error) {
    // Unverifiable = anonymous: counted by address, never refused for it.
    console.warn('[inventory] Ceilings bearer check failed', tenantId, error instanceof Error ? error.message : error)
    return null
  }
}

function toJsonOptionCeilings(options: OptionStockCeilings): Record<string, Record<string, number>> {
  return Object.fromEntries([...options].map(([menuItemId, byOption]) => [menuItemId, Object.fromEntries(byOption)]))
}
