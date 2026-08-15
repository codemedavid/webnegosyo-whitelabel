import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/inventory/order-stock
 *
 * The POS register in webnegosyo-app writes counter sales straight to the
 * tenant's Convex deployment, so it never passes through `createOrderAction` —
 * the single place order-driven depletion is wired. Without this route, the
 * highest-volume stock event a merchant has (a sale over the counter) would
 * leave stock untouched.
 *
 * The register calls this after the order is safely written, so depletion here
 * is best-effort by the same reasoning as every other backend: the sale is
 * already rung up and paid for. A drifting ledger is reconcilable; a register
 * that refuses to close a sale because of a stock write is not. This route
 * therefore reports success once the caller is authorized, whatever the ledger
 * write then does.
 *
 * The `restore` action is the mirror image: cancelling an order held in Convex
 * (a voided counter sale, or an online order cancelled from the merchant app)
 * never reaches `updateOrderStatus` either, so without it a cancelled order's
 * ingredients stayed spent. Restore needs no items — the reversal is derived
 * from the sale movements the order actually recorded.
 *
 * Authenticated via the caller's own Supabase access token — same trust level
 * as /api/revalidate-menu and `verifyTenantAdmin` in src/lib/admin-service.ts.
 */

/** What the caller wants done to this order's stock. */
type StockAction = 'deplete' | 'restore' | 'revise'

const STOCK_ACTIONS: readonly StockAction[] = ['deplete', 'restore', 'revise']

/** One configured line of the sale, as the register sends it. */
interface OrderStockItemInput {
  menuItemId?: unknown
  quantity?: unknown
  optionIds?: unknown
  addonIds?: unknown
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * Validate and normalise the lines a caller sent into depletion items.
 *
 * Anything without a menu item or a positive quantity is dropped rather than
 * rejected: one unresolvable line must not stop the rest of an order's stock
 * from moving.
 */
function toDepletionItems(value: unknown) {
  if (!Array.isArray(value)) return []

  return (value as OrderStockItemInput[])
    .filter((item) => typeof item?.menuItemId === 'string' && Number(item?.quantity) > 0)
    .map((item) => {
      const optionIds = toStringArray(item.optionIds)
      return {
        menuItemId: item.menuItemId as string,
        quantity: Number(item.quantity),
        // The same id set feeds both buckets: an id is unique per option, so
        // whichever recipe target exists matches and the other finds nothing.
        // Mirrors `depleteStockForOrder` in src/app/actions/orders.ts.
        optionIds,
        modifierOptionIds: optionIds,
        // Carried through so addon-targeted recipes deplete too. Hardcoding
        // this empty was the defect that made counter sales base-recipe-only
        // for add-ons while web checkout spent them.
        addonIds: toStringArray(item.addonIds),
      }
    })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const orderId = body?.orderId
  const rawItems = body?.items

  if (!tenantId || !orderId) {
    return NextResponse.json(
      { error: 'tenantId and orderId are required' },
      { status: 400 },
    )
  }

  // Absent means deplete: the POS register shipped before this discriminator
  // existed and sends no action.
  const action: unknown = body?.action ?? 'deplete'
  if (!STOCK_ACTIONS.includes(action as StockAction)) {
    return NextResponse.json(
      { error: `action must be one of ${STOCK_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  // Only depletion needs the sale's lines. A restore reverses what the order
  // already recorded, so a cancelling client needs nothing but the order id.
  if (action === 'deplete' && !Array.isArray(rawItems)) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
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
    .select('role, tenant_id, outlet_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  // The branch is the ORDER's, and the account's only as a fallback.
  //
  // Never the request body's — the same rule push registration follows, and a
  // client-named branch on a write path would let one shop spend another's
  // stock. But the acting account is not the answer either: an owner or any
  // store-wide account (`outlet_id` NULL) ringing a sale at North would spend
  // the unbranched pool and leave North's shelf untouched. The stock a sale
  // consumed came off the shelf the sale was made at, which is what the order
  // records — the reasoning the public sibling route already spells out.
  //
  // The account is the fallback because a POS tenant's orders live in Convex,
  // not in this table: there is no row to read, and the register standing in
  // one shop is then the best evidence of where the stock went. A branch
  // manager who cannot see another branch's order row falls back to their own
  // branch, which for them is the same answer.
  const accountOutletId =
    typeof appUser?.outlet_id === 'string' && appUser.outlet_id.trim() !== ''
      ? appUser.outlet_id
      : null

  const { data: orderRow } = await supabase
    .from('orders')
    .select('outlet_id')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const orderOutletId =
    typeof orderRow?.outlet_id === 'string' && orderRow.outlet_id.trim() !== ''
      ? orderRow.outlet_id
      : null

  const actorOutletId = orderOutletId ?? accountOutletId

  if (action === 'restore') {
    const { reverseOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
    await reverseOrderStockBestEffort(tenantId, orderId)
    return NextResponse.json({ success: true })
  }

  // A saved edit moves only the DIFFERENCE — the order's original sale already
  // spent its ingredients. The caller sends both directions because one edit
  // can do both (a customer swaps a bun for a latte), already netted per
  // configuration by `lib/pos-stock-revision.ts` on the client.
  if (action === 'revise') {
    const revision = Number(body?.revision)
    // Revision 0 is the original sale's claim. An edit that arrived without a
    // usable revision would collide with it and be silently refused as a
    // duplicate, so it is rejected loudly instead.
    if (!Number.isInteger(revision) || revision < 1) {
      return NextResponse.json(
        { error: 'revision must be an integer of at least 1' },
        { status: 400 },
      )
    }

    const { applyOrderRevisionStockBestEffort } = await import(
      '@/lib/inventory/order-stock-service'
    )
    await applyOrderRevisionStockBestEffort(
      tenantId,
      orderId,
      revision,
      toDepletionItems(body?.deplete),
      toDepletionItems(body?.restore),
      actorOutletId,
    )
    return NextResponse.json({ success: true })
  }

  const items = toDepletionItems(rawItems)

  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  await applyOrderStockBestEffort(tenantId, orderId, items, 'sale', 0, actorOutletId)

  return NextResponse.json({ success: true })
}
