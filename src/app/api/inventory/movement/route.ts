import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordStockMovementWith } from '@/lib/inventory/stock-service'

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

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const { movement, item } = await recordStockMovementWith(
      // A Bearer-token client built from the untyped `createClient`, where the
      // service expects the `Database`-typed server one. The queries it runs
      // are identical; only the generic differs.
      supabase as never,
      tenantId,
      {
        inventory_item_id: inventoryItemId,
        reason,
        quantity,
        unit_id: unitId,
        note: typeof body?.note === 'string' ? body.note : undefined,
      },
    )

    return NextResponse.json({ success: true, movement, item })
  } catch (error) {
    // The merchant is waiting on this. Return the reason rather than a generic
    // failure — "the movement unit could not be resolved" is actionable and a
    // bare 500 is not.
    const message =
      error instanceof Error ? error.message : 'The movement could not be recorded'
    console.error('[inventory] Manual movement failed', tenantId, error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
