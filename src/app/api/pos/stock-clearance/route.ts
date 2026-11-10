import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { callerHasFeature } from '@/lib/gov-discount-ledger/caller-scope'
import { outletRefusal, resolveRouteOutlet } from '@/lib/gov-discount-ledger/route-guards'
import { parseStockClearanceRequest, decideStockClearance } from '@/lib/inventory/pos-stock-clearance'
import { createLogger } from '@/lib/logger'

// Only log.error is used (never gated); the flag is the manager-PIN family's.
const log = createLogger('[pos/stock-clearance]', 'DEBUG_GOV_DISCOUNTS')

/** One call per sale at Charge; a leaked token must not loop the stock read. */
const RATE_LIMIT: RateLimitOptions = { limit: 120, windowSec: 60, onRedisFailure: 'instance' }

/**
 * POST /api/pos/stock-clearance
 *
 * The register's stock check for ONE sale on a 'block' store, asked at Charge
 * with the order id it minted, before the sale is handed over. The answer is
 * what the database requires before it accepts that order from a client
 * (migration 20261110120000):
 *
 *   200 { status: 'not_required' }            a 'warn' store
 *   200 { status: 'cleared', clearanceId }     the shelf covers it
 *   200 { status: 'approved', clearanceId, approverName }
 *                                             short, approved by the caller's
 *                                             own right or a manager's PIN
 *   409 { status: 'needs_manager', shortfalls, approvers }
 *
 * The caller is a member of the store who works the register (`pos`) or the
 * orders (`orders`, the QR hand-off); the branch is the caller's own. PIN
 * guesses share the manager-PIN limits and the database lock with Senior/PWD
 * approvals and remittances.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseStockClearanceRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { tenantId } = parsed.value
  const caller = await requireBearerStoreCaller(request, tenantId, 'create')
  if (!caller.ok) return caller.response
  const appUser = caller.appUser
  if (!appUser || !(callerHasFeature(appUser, 'pos') || callerHasFeature(appUser, 'orders'))) {
    return NextResponse.json({ error: 'You do not have permission for this.' }, { status: 403 })
  }

  const limit = await checkRateLimit(`pos-stock-clearance:${tenantId}:${caller.user.id}`, RATE_LIMIT)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  try {
    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
    const { resolveLedgerActor } = await import('@/lib/gov-discount-ledger/actor')
    const { createClearanceStore } = await import('@/lib/inventory/pos-stock-clearance-store')
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })

    const outlet = await resolveRouteOutlet(db, appUser, tenantId, parsed.value.outletId)
    if (!outlet.ok) return outletRefusal(outlet)

    const actor = await resolveLedgerActor(db, tenantId, caller.user)
    const outcome = await decideStockClearance(
      createClearanceStore(db),
      { ...parsed.value, outletId: outlet.outletId },
      {
        userId: actor.userId,
        name: actor.name,
        account: {
          userId: actor.userId,
          name: actor.name,
          role: appUser.role,
          isOwner: appUser.is_owner === true,
          permissions: appUser.permissions ?? null,
          outletId: appUser.outlet_id ?? null,
        },
      },
    )

    if (outcome.ok) {
      // The branch the clearance is bound to, so the register can tell when it
      // differs from the branch its order row will carry.
      return NextResponse.json({
        status: outcome.status,
        ...('clearanceId' in outcome ? { clearanceId: outcome.clearanceId } : {}),
        ...('approverName' in outcome ? { approverName: outcome.approverName } : {}),
        outletId: outlet.outletId,
      })
    }
    if ('code' in outcome) {
      return NextResponse.json(
        { status: outcome.code, error: outcome.error, shortfalls: outcome.shortfalls, approvers: outcome.approvers },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  } catch (error) {
    log.error('failed', { tenantId, error: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'Could not check the stock. Try again.' }, { status: 500 })
  }
}
