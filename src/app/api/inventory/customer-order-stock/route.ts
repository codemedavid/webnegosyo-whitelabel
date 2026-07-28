import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildDepletionItemsFromOrderRows } from '@/lib/inventory/customer-order-items'
import { applyOrderStockBestEffort } from '@/lib/inventory/order-stock-service'

/**
 * POST /api/inventory/customer-order-stock
 *
 * The white-labeled customer app (`mobile/`) writes its orders straight to the
 * platform `orders` table, so it never passes through `createOrderAction` where
 * order-driven depletion is wired. Until this existed, an order placed in a
 * merchant's own branded app moved no stock at all — no depletion, no low-stock
 * alert, no auto-86 — while the same order placed on the web moved all three.
 *
 * WHY THIS ROUTE IS UNAUTHENTICATED, AND WHY THAT IS SAFE.
 * A diner has no account, so this cannot be gated on a merchant session the way
 * /api/inventory/order-stock is for the register. It is guarded by carrying
 * nothing steerable instead: the caller names a tenant and an order, and every
 * dish and quantity is read back out of the order the platform already holds.
 * Any `items` in the body are ignored. The worst a forged call can achieve is
 * triggering the depletion that order had already earned, and the ledger's
 * order+direction guard means that happens once.
 *
 * Best-effort by the same reasoning as every other depletion path: by the time
 * this runs the order is saved and the customer is looking at a confirmation. A
 * stock failure must never turn that into an error they cannot act on.
 *
 * NOT covered: tenants whose orders live in Convex or their own Supabase
 * project. Their orders are not in this table to be read back, so the same
 * guarantee cannot be made without trusting the caller's lines.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const orderId = body?.orderId

  if (typeof tenantId !== 'string' || typeof orderId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId and orderId are required' },
      { status: 400 },
    )
  }

  try {
    const supabase = createAdminClient()

    // Same gate `createOrderAction` applies: a tenant who has not turned
    // inventory on must never accumulate a ledger they did not ask for.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('inventory_enabled')
      .eq('id', tenantId)
      .single()

    if (tenant?.inventory_enabled !== true) {
      return NextResponse.json({ success: true, skipped: 'inventory_disabled' })
    }

    // The order is what makes this payload trustworthy, so it is checked before
    // anything is spent. A missing order and one belonging to another tenant
    // answer the same way — neither is this caller's to act on.
    const { data: order } = await supabase
      .from('orders')
      .select('tenant_id')
      .eq('id', orderId)
      .single()

    if (!order || order.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: lines } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity')
      .eq('order_id', orderId)

    const items = buildDepletionItemsFromOrderRows(lines ?? [])
    if (items.length > 0) {
      await applyOrderStockBestEffort(tenantId, orderId, items)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    // Reported as success on purpose. The order is placed; a diner has no way
    // to act on a stock error and no reason to be shown one. The ledger is
    // reconcilable by stocktake, a frightened customer is not.
    console.error('[inventory] Customer order depletion failed', orderId, error)
    return NextResponse.json({ success: true, skipped: 'error' })
  }
}
