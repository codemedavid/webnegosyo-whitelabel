import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  createTransferWith,
  sendTransferWith,
  receiveTransferWith,
  cancelTransferWith,
} from '@/lib/inventory/stock-transfers-service'
import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'

/**
 * POST /api/inventory/transfers
 *
 * The merchant app's way to move stock between shops. The web admin has had
 * this since phase 3; the phone has not — which is backwards, because the
 * person counting a delivery in is standing at a bench with a box, and the
 * person composing one is at a desk with a browser already open.
 *
 * Why a route, when RLS would let the app insert `stock_movements` directly:
 * a transfer is two ledger legs that have to agree, a status transition that
 * stops a stale screen sending the same load twice, and a source unit cost
 * frozen at send time so a price change in transit cannot revalue stock on a
 * van. A direct insert would get all three wrong, one leg at a time.
 *
 * Like /api/inventory/movement and unlike /api/inventory/order-stock, this is
 * NOT best-effort. Nothing here runs behind a paid order; a merchant is waiting
 * to be told the stock moved. Every failure is returned, including the service's
 * own refusals — "you can only move stock in and out of your own branch" is the
 * single most useful thing this route can say to a branch manager, and a bare
 * 500 would leave them retrying something that will never work.
 *
 * Authority is NOT decided here. The `...With` services re-resolve the acting
 * account's branch scope from `app_users` using the caller's own token and run
 * `canSendTransfer` / `canReceiveTransfer` themselves, so a manager naming
 * another shop is refused by the same code the web admin goes through. This
 * route only decides who may reach transfers at all.
 */

const ACTIONS = ['create', 'send', 'receive', 'cancel'] as const
type TransferAction = (typeof ACTIONS)[number]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const action = body?.action

  if (typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  if (!ACTIONS.includes(action as TransferAction)) {
    return NextResponse.json(
      { error: `action must be one of ${ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  // Every step but the draft names an existing document. Checked before
  // authorization work so a malformed request cannot cost a round trip.
  const transferId = body?.transferId
  if (action !== 'create' && typeof transferId !== 'string') {
    return NextResponse.json({ error: 'transferId is required' }, { status: 400 })
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
    .select('role, tenant_id, permissions, is_owner')
    .eq('user_id', user.id)
    .single()

  // Belonging to the tenant is not enough — every staff member here is
  // `role='admin'`, so reach lives in `permissions`. A cashier holding only
  // `pos` could otherwise send a transfer and empty their own shop's shelf onto
  // another's book. `menu` is the same key that gates the inventory tab, so the
  // door and the UI agree rather than merely looking like they do.
  const isTenantMember =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isTenantMember || !hasPermission(appUser as PermissionHolder, 'menu')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // A store that has not switched inventory on must never accumulate a ledger
  // it did not ask for. Refused rather than silently skipped: someone is
  // watching this one and deserves to know why nothing happened.
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
    // A Bearer-token client where the service expects the `Database`-typed
    // server one. The queries are identical; only the generic differs.
    const actor = supabase as never

    if (action === 'create') {
      const { id } = await createTransferWith(actor, tenantId, {
        fromOutletId: typeof body?.fromOutletId === 'string' ? body.fromOutletId : null,
        toOutletId: typeof body?.toOutletId === 'string' ? body.toOutletId : null,
        lines: Array.isArray(body?.lines) ? body.lines : [],
        note: typeof body?.note === 'string' ? body.note : undefined,
      })
      return NextResponse.json({ success: true, id })
    }

    if (action === 'send') {
      await sendTransferWith(actor, tenantId, transferId as string)
    } else if (action === 'receive') {
      // What is physically on the bench, not what the paperwork claims. An
      // absent `counts` is an empty object rather than a default to the sent
      // quantity: assuming the load arrived intact is the exact assumption the
      // receive step exists to stop being made.
      const counts =
        body?.counts && typeof body.counts === 'object' && !Array.isArray(body.counts)
          ? (body.counts as Record<string, number>)
          : {}
      await receiveTransferWith(actor, tenantId, transferId as string, counts)
    } else {
      await cancelTransferWith(actor, tenantId, transferId as string)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The transfer could not be updated'
    console.error('[inventory] Transfer step failed', tenantId, action, error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
