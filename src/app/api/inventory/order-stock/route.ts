import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { isUuid } from '@/lib/uuid'
import { validateAddonQuantities } from '@/lib/inventory/selection-quantities'
import { parseStockAuditSource, type StockAuditContext } from '@/lib/inventory/stock-audit'

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
 * from the sale movements the order actually recorded. It is refused (409) for
 * an order the server can read and that is NOT cancelled, and it gives a
 * pre-order's date stock back, as `updateOrderStatus` does.
 *
 * `redeplete` is the un-cancel: an order leaving `cancelled` from the app
 * spends exactly what its cancellation put back. Refused (409) while the
 * stored order is still cancelled.
 *
 * Authenticated via the caller's own Supabase access token — same trust level
 * as /api/revalidate-menu and `verifyTenantAdmin` in src/lib/admin-service.ts.
 */

/** What the caller wants done to this order's stock. */
type StockAction = 'deplete' | 'restore' | 'revise' | 'redeplete'

const STOCK_ACTIONS: readonly StockAction[] = ['deplete', 'restore', 'revise', 'redeplete']

/**
 * The server's own read of the order, from whichever backend holds it.
 * `unreadable` = the read threw (backend down): the caller should retry, so
 * lifecycle-gated actions answer 503 rather than guess.
 */
type LifecycleRead =
  | { kind: 'found'; status: string; customerData: unknown; outletId: string | null }
  | { kind: 'missing' }
  | { kind: 'unreadable' }

async function readOrderLifecycle(tenantId: string, orderId: string): Promise<LifecycleRead> {
  try {
    const { readStoredOrderLifecycle } = await import('@/lib/order-lifecycle-read')
    const order = await readStoredOrderLifecycle(tenantId, orderId)
    if (!order) return { kind: 'missing' }
    return {
      kind: 'found',
      status: order.status,
      customerData: order.customerData,
      outletId: order.outletId ?? null,
    }
  } catch (error) {
    console.error('[order-stock] Could not read the order', { tenantId, orderId }, error)
    return { kind: 'unreadable' }
  }
}

function lifecycleRefusal(read: LifecycleRead, mustBeCancelled: boolean): NextResponse | null {
  if (read.kind === 'unreadable') {
    return NextResponse.json({ error: 'order_unreadable' }, { status: 503 })
  }
  // A missing order (not found, or a backend this server cannot reach) keeps
  // the behaviour these actions always had: the caller is an authenticated
  // member of the store acting on its own order.
  if (read.kind === 'missing') return null
  const isCancelled = read.status === 'cancelled'
  if (isCancelled !== mustBeCancelled) {
    return NextResponse.json(
      { error: mustBeCancelled ? 'order_not_cancelled' : 'order_still_cancelled' },
      { status: 409 },
    )
  }
  return null
}

/** One configured line of the sale, as the register sends it. */
interface OrderStockItemInput {
  menuItemId?: unknown
  quantity?: unknown
  optionIds?: unknown
  addonIds?: unknown
  addonQuantities?: unknown
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
    .filter((item) => typeof item?.menuItemId === 'string' && Number.isFinite(Number(item?.quantity)) && Number(item?.quantity) > 0)
    .map((item) => {
      const optionIds = toStringArray(item.optionIds)
      const addonIds = toStringArray(item.addonIds)
      // One malformed portion count must not cost the line its base recipe:
      // only the entries that validate are kept (an absent count means one).
      const addonQuantities = item.addonQuantities && typeof item.addonQuantities === 'object' && !Array.isArray(item.addonQuantities)
        ? Object.fromEntries(Object.entries(item.addonQuantities).filter(([id, quantity]) =>
            validateAddonQuantities({ [id]: quantity }, addonIds)))
        : undefined
      return {
        menuItemId: item.menuItemId as string,
        quantity: Number(item.quantity),
        // The same id set feeds both buckets: an id is unique per option, so
        // whichever recipe target exists matches and the other finds nothing.
        // Mirrors `depleteStockForOrder` in src/app/actions/orders.ts.
        optionIds,
        modifierOptionIds: [...new Set([...optionIds, ...addonIds])],
        // Carried through so addon-targeted recipes deplete too. Hardcoding
        // this empty was the defect that made counter sales base-recipe-only
        // for add-ons while web checkout spent them.
        addonIds,
        ...(addonQuantities ? { addonQuantities } : {}),
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

  const caller = await requireBearerStoreCaller(request, tenantId, 'edit')
  if (!caller.ok) return caller.response
  const { supabase, user, appUser } = caller

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

  // Only a platform order has a row here. A Convex id is not a uuid and
  // PostgREST rejects the whole request on it, so the read is skipped rather
  // than attempted — the account fallback below is the answer either way.
  const { data: orderRow } = isUuid(orderId)
    ? await supabase
        .from('orders')
        .select('outlet_id')
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    : { data: null }

  const orderOutletId =
    typeof orderRow?.outlet_id === 'string' && orderRow.outlet_id.trim() !== ''
      ? orderRow.outlet_id
      : null

  // A Convex order has no row above, so a store-wide account (owner, full
  // admin) would otherwise spend the unbranched pool for a sale a branch made.
  // Its branch is read from Convex itself — only when it matters (a deplete or
  // revise by a store-wide account), since a branch account's own branch is
  // already the answer. A failed read keeps the old fallback.
  let convexOutletId: string | null = null
  if (!orderOutletId && !accountOutletId && !isUuid(orderId) && (action === 'deplete' || action === 'revise')) {
    const read = await readOrderLifecycle(tenantId, orderId)
    convexOutletId = read.kind === 'found' ? read.outletId : null
  }

  const actorOutletId = orderOutletId ?? convexOutletId ?? accountOutletId

  // For the audit log: WHICH screen asked (register, QR scan, order list …) and
  // WHO was signed in. The source is a label from a fixed list, never an
  // authority — an unknown or missing value (every app build before this
  // field existed) is recorded as the merchant app.
  const audit: StockAuditContext = {
    source: parseStockAuditSource(body?.source, 'merchant_app'),
    actorUserId: user.id,
  }

  if (action === 'restore') {
    // Never reverse a live order: that hides what left the shelf AND burns the
    // void claim its real cancellation will need.
    const read = await readOrderLifecycle(tenantId, orderId)
    const refusal = lifecycleRefusal(read, true)
    if (refusal) return refusal

    const { reverseOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
    await reverseOrderStockBestEffort(tenantId, orderId, audit)

    // A cancelled pre-order gives its date stock back, like `updateOrderStatus`
    // and the Convex order sheet do. The claim rides in the SERVER's copy of
    // customer_data, never the request body. Idempotent per claim.
    if (read.kind === 'found') {
      const { releasePresellForCancelledConvexOrder } = await import('@/lib/presell/convex-cancel')
      await releasePresellForCancelledConvexOrder(tenantId, read.customerData)
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'redeplete') {
    const read = await readOrderLifecycle(tenantId, orderId)
    const refusal = lifecycleRefusal(read, false)
    if (refusal) return refusal

    const { redepleteOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
    await redepleteOrderStockBestEffort(tenantId, orderId, audit)
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
      audit,
    )
    return NextResponse.json({ success: true })
  }

  const items = toDepletionItems(rawItems)

  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  await applyOrderStockBestEffort(tenantId, orderId, items, 'sale', 0, actorOutletId, { context: audit })

  return NextResponse.json({ success: true })
}
