import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { validateAddonQuantities } from '@/lib/inventory/selection-quantities'
import { parseStockAuditSource, type StockAuditContext } from '@/lib/inventory/stock-audit'
import type { StockWriteOutcome } from '@/lib/inventory/order-stock-service'

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
 * On top of store membership the caller needs an order-handling grant, may
 * only act on its own branch's orders, and — on the platform backend, where a
 * miss is proof — on an order that exists.
 */

/** What the caller wants done to this order's stock. */
type StockAction = 'deplete' | 'restore' | 'revise' | 'redeplete'

const STOCK_ACTIONS: readonly StockAction[] = ['deplete', 'restore', 'revise', 'redeplete']

/**
 * Who may move an order's stock: anyone who handles orders at the counter, the
 * pass or the floor. A staffer with only menu, analytics or customer grants
 * has no order screen that writes stock, so a token of theirs must not either.
 * (`kitchen` and `tables` are implied by `orders`.)
 */
const ORDER_HANDLING_PERMISSIONS: readonly StaffPermissionKey[] = ['pos', 'orders', 'kitchen', 'tables', 'order_edit']

/**
 * Per signed-in person. A busy register sends one call per sale, edit or
 * status change; each call costs an order read on the order's backend plus the
 * ledger work, so a leaked token must not be able to loop it.
 */
const RATE_LIMIT: RateLimitOptions = { limit: 300, windowSec: 60, onRedisFailure: 'instance' }

/** Same ceiling as the simple-option RPC's parent quantity. */
const MAX_LINE_QUANTITY = 9999

/**
 * The server's own read of the order, from whichever backend holds it.
 * `unreadable` = the read threw (backend down): the caller should retry, so
 * lifecycle-gated actions answer 503 rather than guess. `isProvenMissing` is
 * true only where a miss is proof (platform): a Convex store without a deploy
 * key answers "missing" for every order.
 */
type LifecycleRead =
  | { kind: 'found'; status: string; customerData: unknown; outletId: string | null }
  | { kind: 'missing'; isProvenMissing: boolean }
  | { kind: 'unreadable' }

async function readOrderLifecycle(tenantId: string, orderId: string): Promise<LifecycleRead> {
  try {
    const { readRoutedOrderLifecycle } = await import('@/lib/order-lifecycle-read')
    const { backend, order } = await readRoutedOrderLifecycle(tenantId, orderId)
    if (!order) return { kind: 'missing', isProvenMissing: backend === 'platform' }
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

function refuse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status })
}

/**
 * The service never throws, so a write that did not happen has to be said
 * here. A 200 would tell the app's durable stock queue the shelf moved and it
 * would drop the call for good; every write is claimed, so the retry a 503
 * asks for cannot spend an order twice.
 */
function settledResponse(outcome: StockWriteOutcome): NextResponse {
  if (outcome === 'failed') return refuse(503, 'stock_write_failed')
  return NextResponse.json({ success: true })
}

/** Only restore/redeplete care whether the order is cancelled right now. */
function lifecycleRefusal(read: LifecycleRead, mustBeCancelled: boolean): NextResponse | null {
  if (read.kind !== 'found') return null
  const isCancelled = read.status === 'cancelled'
  if (isCancelled === mustBeCancelled) return null
  return refuse(409, mustBeCancelled ? 'order_not_cancelled' : 'order_still_cancelled')
}

/**
 * Refusals every action shares, from the server's read of the order.
 *
 * - unreadable → 503, retry.
 * - a platform order that does not exist → 404. Nothing real to spend for, so
 *   a forged id cannot drain the shelf; the register retries a 404, which
 *   covers an order row that has not landed yet.
 * - a branch account acting on another branch's order → 403. An unbranched
 *   order (or a store-wide account) is never refused here.
 */
function orderRefusal(read: LifecycleRead, accountOutletId: string | null): NextResponse | null {
  if (read.kind === 'unreadable') return refuse(503, 'order_unreadable')
  if (read.kind === 'missing') return read.isProvenMissing ? refuse(404, 'order_not_found') : null
  if (accountOutletId && read.outletId && read.outletId !== accountOutletId) {
    return refuse(403, 'order_belongs_to_another_branch')
  }
  return null
}

function mayHandleOrders(appUser: AppUserScopeRow | null): boolean {
  if (!appUser) return false
  return ORDER_HANDLING_PERMISSIONS.some((key) => hasPermission(appUser, key))
}

function accountOutletOf(appUser: AppUserScopeRow | null): string | null {
  return typeof appUser?.outlet_id === 'string' && appUser.outlet_id.trim() !== ''
    ? appUser.outlet_id
    : null
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

function isSellableQuantity(value: unknown): boolean {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_LINE_QUANTITY
}

/**
 * Validate and normalise the lines a caller sent into depletion items.
 *
 * Anything without a menu item or a whole, bounded quantity is dropped rather
 * than rejected: one unresolvable line must not stop the rest of an order's
 * stock from moving.
 */
function toDepletionItems(value: unknown) {
  if (!Array.isArray(value)) return []

  return (value as OrderStockItemInput[])
    .filter((item) => typeof item?.menuItemId === 'string' && isSellableQuantity(item?.quantity))
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

interface StockRequest {
  tenantId: string
  orderId: string
  action: StockAction
  body: Record<string, unknown>
}

function parseStockRequest(body: unknown): StockRequest | NextResponse {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const { tenantId, orderId } = record
  if (typeof tenantId !== 'string' || !tenantId || typeof orderId !== 'string' || !orderId) {
    return refuse(400, 'tenantId and orderId are required')
  }

  // Absent means deplete: the POS register shipped before this discriminator
  // existed and sends no action.
  const action: unknown = record.action ?? 'deplete'
  if (!STOCK_ACTIONS.includes(action as StockAction)) {
    return refuse(400, `action must be one of ${STOCK_ACTIONS.join(', ')}`)
  }

  // Only depletion needs the sale's lines. A restore reverses what the order
  // already recorded, so a cancelling client needs nothing but the order id.
  if (action === 'deplete' && !Array.isArray(record.items)) {
    return refuse(400, 'items must be an array')
  }
  if (action === 'revise') {
    // Revision 0 is the original sale's claim. An edit that arrived without a
    // usable revision would collide with it and be silently refused as a
    // duplicate, so it is rejected loudly instead.
    const revision = Number(record.revision)
    if (!Number.isInteger(revision) || revision < 1) {
      return refuse(400, 'revision must be an integer of at least 1')
    }
  }
  return { tenantId, orderId, action: action as StockAction, body: record }
}

interface ActionContext {
  request: StockRequest
  read: LifecycleRead
  /** The branch whose shelf a sale or edit spends. */
  outletId: string | null
  audit: StockAuditContext
}

async function restore({ request, read, audit }: ActionContext): Promise<NextResponse> {
  // Never reverse a live order: that hides what left the shelf AND burns the
  // void claim its real cancellation will need.
  const refusal = lifecycleRefusal(read, true)
  if (refusal) return refusal

  const { reverseOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  const outcome = await reverseOrderStockBestEffort(request.tenantId, request.orderId, audit)

  // A cancelled pre-order gives its date stock back, like `updateOrderStatus`
  // and the Convex order sheet do. The claim rides in the SERVER's copy of
  // customer_data, never the request body. Idempotent per claim.
  if (read.kind === 'found') {
    const { releasePresellForCancelledConvexOrder } = await import('@/lib/presell/convex-cancel')
    await releasePresellForCancelledConvexOrder(request.tenantId, read.customerData)
  }
  return settledResponse(outcome)
}

async function redeplete({ request, read, audit }: ActionContext): Promise<NextResponse> {
  const refusal = lifecycleRefusal(read, false)
  if (refusal) return refusal

  const { redepleteOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  return settledResponse(await redepleteOrderStockBestEffort(request.tenantId, request.orderId, audit))
}

/**
 * A saved edit moves only the DIFFERENCE — the order's original sale already
 * spent its ingredients. The caller sends both directions because one edit can
 * do both (a customer swaps a bun for a latte), already netted per
 * configuration by `lib/pos-stock-revision.ts` on the client.
 */
async function revise({ request, outletId, audit }: ActionContext): Promise<NextResponse> {
  const { applyOrderRevisionStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  const outcome = await applyOrderRevisionStockBestEffort(
    request.tenantId,
    request.orderId,
    Number(request.body.revision),
    toDepletionItems(request.body.deplete),
    toDepletionItems(request.body.restore),
    outletId,
    audit,
  )
  return settledResponse(outcome)
}

async function deplete({ request, outletId, audit }: ActionContext): Promise<NextResponse> {
  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  const outcome = await applyOrderStockBestEffort(
    request.tenantId, request.orderId, toDepletionItems(request.body.items), 'sale', 0, outletId, { context: audit },
  )
  return settledResponse(outcome)
}

const HANDLERS: Record<StockAction, (context: ActionContext) => Promise<NextResponse>> = {
  deplete,
  restore,
  revise,
  redeplete,
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = parseStockRequest(await request.json().catch(() => null))
  if (parsed instanceof NextResponse) return parsed
  const { tenantId, orderId } = parsed

  const caller = await requireBearerStoreCaller(request, tenantId, 'edit')
  if (!caller.ok) return caller.response
  const { supabase, user, appUser } = caller
  if (!mayHandleOrders(appUser)) return refuse(403, 'missing_order_permission')

  const rate = await checkRateLimit(`order-stock:${user.id}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
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

  const accountOutletId = accountOutletOf(appUser)
  const read = await readOrderLifecycle(tenantId, orderId)
  const refusal = orderRefusal(read, accountOutletId)
  if (refusal) return refusal

  // The branch is the ORDER's, and the account's only as a fallback.
  //
  // Never the request body's — the same rule push registration follows, and a
  // client-named branch on a write path would let one shop spend another's
  // stock. But the acting account is not the answer either: an owner or any
  // store-wide account (`outlet_id` NULL) ringing a sale at North would spend
  // the unbranched pool and leave North's shelf untouched. The stock a sale
  // consumed came off the shelf the sale was made at, which is what the order
  // records. The account is the fallback for an order the server cannot read
  // (a Convex store without a deploy key): the register standing in one shop
  // is then the best evidence of where the stock went.
  const orderOutletId = read.kind === 'found' ? read.outletId : null

  // For the audit log: WHICH screen asked (register, QR scan, order list …) and
  // WHO was signed in. The source is a label from a fixed list, never an
  // authority — an unknown or missing value (every app build before this
  // field existed) is recorded as the merchant app.
  const audit: StockAuditContext = {
    source: parseStockAuditSource(parsed.body.source, 'merchant_app'),
    actorUserId: user.id,
  }

  return HANDLERS[parsed.action]({
    request: parsed,
    read,
    outletId: orderOutletId ?? accountOutletId,
    audit,
  })
}
