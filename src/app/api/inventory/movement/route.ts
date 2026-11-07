import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordStockMovementWith } from '@/lib/inventory/stock-service'
import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'
import { movementInputForCaller, movementResultForCaller } from '@/lib/inventory/cost-visibility'
import { PERMISSION_REFUSALS } from '@/lib/inventory/permission-refusals'
import { resolveBranchScope, type BranchScopedUser } from '@/lib/outlets/branch-scope'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { ZodError } from 'zod'
import { asAppUserQueryClient, fetchAppUserScope } from '@/lib/queries/fetch-app-user-scope'

/**
 * POST /api/inventory/movement
 *
 * The merchant app's way to record a delivery, a stocktake or waste. Until this
 * existed, inventory on the phone was read-only: a merchant could see that
 * flour was out but had to reach a laptop to say it had arrived.
 *
 * Unlike /api/inventory/order-stock, this route is NOT best-effort. That one
 * runs behind a sale already rung up and paid for, where a stock failure must
 * not fail the tender. Here the merchant is watching and waiting to be told the
 * write landed — reporting a success it did not have would surface at the next
 * stocktake with no way to tell which movement went missing. Every failure is
 * returned.
 *
 * Why a route at all, when `stock_movements` RLS would let the app insert
 * directly: the signed delta must be resolved against the on-hand quantity read
 * in the same request, a delivery's price must blend into the moving average,
 * and crossing the reorder line must raise alerts and can 86 a dish. A direct
 * insert from the phone would skip the last two and resolve the first from
 * whatever figure the screen last refreshed.
 *
 * Authenticated via the caller's own Supabase access token — the same trust
 * level as /api/inventory/order-stock.
 */

const MANUAL_REASONS = ['receive', 'stocktake', 'waste'] as const
type ManualReason = (typeof MANUAL_REASONS)[number]

/**
 * Per signed-in person. A receiving clerk or a stocktake sends one call per
 * line and each one costs several reads on the database every store shares, so
 * a leaked token must not be able to loop it.
 */
const RATE_LIMIT: RateLimitOptions = { limit: 120, windowSec: 60, onRedisFailure: 'instance' }

/**
 * The refusals this route's own service writes for a person to read. Anything
 * else — a database error, a driver message, a stack — stays in the server log.
 */
const MERCHANT_FACING_REFUSALS: readonly string[] = [
  'That branch does not belong to this store',
  'The movement unit could not be resolved for this ingredient',
]

const UNEXPECTED_FAILURE = 'The movement could not be recorded. Please try again.'

function describeFailure(error: unknown): { status: number; message: string } {
  if (error instanceof ZodError) {
    return { status: 400, message: 'The movement details are not valid. Check the amount and unit.' }
  }
  if (error instanceof Error && MERCHANT_FACING_REFUSALS.includes(error.message)) {
    return { status: 400, message: error.message }
  }
  return { status: 500, message: UNEXPECTED_FAILURE }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const inventoryItemId = body?.inventory_item_id
  const reason = body?.reason
  const quantity = body?.quantity
  const unitId = body?.unit_id

  if (typeof tenantId !== 'string' || typeof inventoryItemId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId and inventory_item_id are required' },
      { status: 400 },
    )
  }

  // Only the three a merchant makes by hand. `sale` and `void` belong to the
  // order path; accepting one here would let the app double-count against the
  // order that already moved the stock.
  if (!MANUAL_REASONS.includes(reason as ManualReason)) {
    return NextResponse.json(
      { error: `reason must be one of ${MANUAL_REASONS.join(', ')}` },
      { status: 400 },
    )
  }

  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json(
      { error: 'quantity must be a positive amount' },
      { status: 400 },
    )
  }

  if (typeof unitId !== 'string') {
    return NextResponse.json({ error: 'unit_id is required' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)

  // Belonging to the tenant is not enough. Every staff member here is
  // `role='admin'` — a deliberate choice, since a new role string would have
  // had to be taught to every existing admin check — so per-feature reach
  // lives in `permissions`. Without this, a cashier holding only `pos` could
  // enter a stocktake, rewriting the shelf figure and surfacing in the daily
  // report as someone else's shrinkage. The sidebar and the app tab already
  // hide inventory from them, but UI is not a boundary and this route is
  // reachable with the token the app is holding.
  //
  // `inventory` is the same key that gates both of those surfaces, so the door
  // and the UI agree. (Phase 0d moved stock off `menu`, which keeps recipes and
  // the ingredient list.)
  const isTenantMember = canAccessStoreAdmin(appUser, tenantId, 'create')

  if (!isTenantMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!hasPermission(appUser as PermissionHolder, 'inventory')) {
    return NextResponse.json({ error: PERMISSION_REFUSALS.recordStock }, { status: 403 })
  }

  const rate = await checkRateLimit(`inventory-movement:${user.id}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  // A tenant who has not turned inventory on must never accumulate a ledger
  // they did not ask for. Refused rather than silently skipped, unlike the
  // order path: someone is watching this one and deserves to know why nothing
  // happened.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('inventory_enabled')
    .eq('id', tenantId)
    .single()

  if (tenant?.inventory_enabled !== true) {
    return NextResponse.json(
      { error: 'Inventory is not switched on for this store' },
      { status: 409 },
    )
  }

  try {
    const caller = appUser as PermissionHolder
    const recorded = await recordStockMovementWith(
      // A Bearer-token client built from the untyped `createClient`, where the
      // service expects the `Database`-typed server one. The queries it runs
      // are identical; only the generic differs.
      supabase as never,
      tenantId,
      movementInputForCaller({
        inventory_item_id: inventoryItemId,
        reason,
        quantity,
        unit_id: unitId,
        // Forwarded, not dropped. `resolveMovementBranch` is what makes this
        // safe to accept from a client: a branch manager naming somebody
        // else's shop is refused, and a store-wide owner choosing a branch is
        // an ordinary thing to do — receiving a delivery into North. Without
        // it an owner could only ever record into the unbranched pool, so
        // their deliveries and their manager's would pile up in two different
        // places for the same physical shelf.
        outlet_id: typeof body?.outletId === 'string' ? body.outletId : undefined,
        // The count session this entry belongs to. Without forwarding it the
        // phone can open and close a count while every entry made during it
        // arrives untagged — a fully counted shelf would report as completely
        // uncounted, which is worse than having no session at all because the
        // report would then actively assert that nobody looked.
        //
        // Safe to accept from a client for the same reason `outlet_id` is: the
        // schema refuses a session on anything but a `stocktake`, and the
        // database refuses both that and a session belonging to another store
        // (trigger, migration 20260812120000).
        inventory_count_id:
          typeof body?.inventory_count_id === 'string' ? body.inventory_count_id : undefined,
        note: typeof body?.note === 'string' ? body.note : undefined,
        // What a delivery cost per unit, so a receipt recorded on the phone
        // moves the moving-average cost like one recorded on the web. Anything
        // that is not a finite number is dropped — omitted means "unchanged",
        // never "free". The schema still refuses a negative.
        unit_cost:
          typeof body?.unit_cost === 'number' && Number.isFinite(body.unit_cost)
            ? body.unit_cost
            : undefined,
        // The phone's key for this one save. A retry after a timeout carries
        // the same key, and the database refuses to record it a second time.
        // The schema rejects anything that is not a uuid.
        client_request_id:
          typeof body?.clientRequestId === 'string' ? body.clientRequestId : undefined,
      }, caller),
      // Everything the service would otherwise resolve for itself, already
      // resolved above to authorize this call. Without it the write repeats a
      // remote `auth.getUser()` twice more and re-reads `app_users` — three
      // sequential round trips before the first byte is written, which is most
      // of the wait a merchant watches on the phone.
      {
        userId: user.id,
        scope: resolveBranchScope(appUser as unknown as BranchScopedUser),
        source: 'merchant_app',
      },
    )

    const { movement, item, alreadyRecorded } = movementResultForCaller(recorded, caller)
    return NextResponse.json({ success: true, movement, item, alreadyRecorded: alreadyRecorded === true })
  } catch (error) {
    // The merchant is waiting on this, so the two refusals the service wrote
    // for them are passed on; everything else is logged here and answered with
    // a sentence that reveals nothing about the database behind it.
    console.error('[inventory] Manual movement failed', tenantId, error)
    const { status, message } = describeFailure(error)
    return NextResponse.json({ error: message }, { status })
  }
}
