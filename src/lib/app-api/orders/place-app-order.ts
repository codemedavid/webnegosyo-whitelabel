import type { AppOrderDetail, AppOrderDraft, AppProfile } from '@/lib/app-contract'
import type { PaymentMethodWithLinks } from '@/lib/checkout/checkout-config'
import type { PlaceOrderInput, PlaceOrderResult, PlacedOrder } from '@/lib/checkout/place-order/types'
import type { Logger } from '@/lib/logger'
import type { OrderType } from '@/lib/app-api/store-types'
import { draftToOrderLines } from './draft-to-lines'
import type { CheckoutQuestionRow } from '../project-catalog'
import type { DraftRequest, DraftTenant, LoadedDraft } from './load-draft'
import type { OrderIndex, PlacedOrderRow } from './order-index'
import { buildPlaceOrderInput, chooseOrderType, ORDER_TYPE_GONE, REWARDS_SOON, type ChosenOrderType } from './order-request'
import { buildOrderSummary, toAppOrderDetail, type LiveOrderState } from './order-summary'
import { failOutcome, okOutcome, type AppOutcome } from './outcome'

/**
 * POST /orders, without HTTP: claim the Idempotency-Key, build the engine's
 * input from the draft, call the ONE order engine (`placeOrder`, channel
 * 'app'), and record what happened in the index. Every dependency is injected.
 *
 * The key row decides what a retry gets:
 *   claimed / failed → place (failed wrote nothing, so the same key may try again)
 *   placed           → the existing order
 *   placing          → "still being placed" — never a second order
 *   another customer's key → bad request
 * A refusal marks the attempt failed. A LOST order is failed only on platform
 * Supabase, where the same clientOrderId dedupes a retry; on Convex or a
 * store's own database the write may have happened, so the row stays
 * 'placing' and the customer is sent to Orders.
 */

export const SIGNED_OUT = 'Please sign in again.'
export const STORE_UNAVAILABLE = 'This store is not taking app orders right now.'
export const STILL_PLACING = 'Your order is still being placed — check Orders in a moment.'
export const KEY_CONFLICT = 'Something went wrong with this checkout. Please start it again.'
export const LOST_ORDER = "We couldn't confirm your order. Check Orders before trying again."

/** A platform attempt still 'placing' this long after its last touch died mid-flight (see takeOverStalePlacing). */
export const STALE_PLACING_MS = 2 * 60 * 1000

export interface PlaceAppOrderDeps {
  index: Pick<OrderIndex, 'claimOrderKey' | 'markPlaced' | 'markFailed' | 'reopenFailed' | 'takeOverStalePlacing'>
  readTenant: (tenantId: string) => Promise<DraftTenant | null>
  loadDraft: (tenant: DraftTenant, request: DraftRequest) => Promise<LoadedDraft>
  readOrderTypes: (tenantId: string) => Promise<OrderType[]>
  readPaymentMethods: (tenantId: string) => Promise<PaymentMethodWithLinks[]>
  /** The store's checkout questions, every order type (`customer_form_fields`). */
  readQuestions: (tenantId: string) => Promise<CheckoutQuestionRow[]>
  readProfile: (tenantId: string, customerId: string) => Promise<AppProfile | null>
  placeOrder: (input: PlaceOrderInput) => Promise<PlaceOrderResult>
  readLive: (tenantId: string, orderId: string) => Promise<LiveOrderState | null>
  log: Logger
}

export interface PlaceAppOrderRequest {
  tenantId: string
  customerId: string
  idempotencyKey: string
  draft: AppOrderDraft
}

interface PreparedOrder {
  input: PlaceOrderInput
  orderType: ChosenOrderType
  outletName: string | null
  paymentMethodName: string | null
}

type Prepared = { ok: true; order: PreparedOrder } | { ok: false; outcome: AppOutcome<AppOrderDetail> }

const stop = (outcome: AppOutcome<AppOrderDetail>): Prepared => ({ ok: false, outcome })

/** Everything the engine needs, or the refusal to answer with. Reads only. */
async function prepare(request: PlaceAppOrderRequest, tenant: DraftTenant, deps: PlaceAppOrderDeps): Promise<Prepared> {
  const { tenantId, customerId, draft } = request
  const [profile, orderTypes, paymentMethods, questions] = await Promise.all([
    deps.readProfile(tenantId, customerId),
    deps.readOrderTypes(tenantId),
    deps.readPaymentMethods(tenantId),
    deps.readQuestions(tenantId),
  ])
  if (!profile) return stop(failOutcome('unauthorized', SIGNED_OUT))
  const orderType = chooseOrderType(orderTypes, draft.orderTypeId)
  if (!orderType) return stop(failOutcome('refused', ORDER_TYPE_GONE))

  const loaded = await deps.loadDraft(tenant, { lines: draft.lines, outletId: draft.outletId })
  if (!loaded.ok) return stop(failOutcome('refused', loaded.error))
  const lines = draftToOrderLines(loaded.input)
  if (!lines.ok) return stop(failOutcome('refused', lines.error))

  const built = buildPlaceOrderInput({
    tenantId,
    draft,
    idempotencyKey: request.idempotencyKey,
    orderType,
    paymentMethods,
    questions,
    profile,
    isLalamoveStore: tenant.isLalamove,
    lines: lines.lines,
    outletId: draft.outletId,
  })
  if (!built.ok) return stop(failOutcome('refused', built.message))
  return { ok: true, order: { input: built.input, orderType, outletName: loaded.outlet?.name ?? null, paymentMethodName: built.paymentMethodName } }
}

async function recordPlaced(id: string, request: PlaceAppOrderRequest, prepared: PreparedOrder, result: PlacedOrder, deps: PlaceAppOrderDeps) {
  const summary = buildOrderSummary({
    lines: result.lines,
    pricing: result.pricing,
    draftLines: request.draft.lines,
    order: result.order,
    orderKind: prepared.orderType.kind,
    orderTypeName: prepared.orderType.name,
    outletName: prepared.outletName,
    paymentMethodName: prepared.paymentMethodName,
  })
  const orderId = String(result.order.id)
  const isRecorded = await deps.index.markPlaced(id, { orderId, summary, status: 'pending' })
  if (!isRecorded) deps.log.error('placed order could not be recorded', { id, orderId, tenantId: request.tenantId })
  const at = new Date().toISOString()
  const row: PlacedOrderRow = {
    id,
    tenantId: request.tenantId,
    appId: request.tenantId,
    customerId: request.customerId,
    backend: result.backend,
    orderId,
    idempotencyKey: request.idempotencyKey,
    state: 'placed',
    summary,
    lastStatus: 'pending',
    lastStatusAt: at,
    placedAt: at,
    createdAt: at,
  }
  return toAppOrderDetail(row, { status: 'pending', paymentStatus: 'pending', estimatedReadyAt: null, number: summary.number })
}

/** One attempt on a key this request holds in 'placing'. */
async function attempt(id: string, request: PlaceAppOrderRequest, tenant: DraftTenant, deps: PlaceAppOrderDeps): Promise<AppOutcome<AppOrderDetail>> {
  let prepared: Prepared
  try {
    prepared = await prepare(request, tenant, deps)
  } catch (error) {
    // Nothing was written: free the key before the read failure answers "unavailable".
    await deps.index.markFailed(id)
    throw error
  }
  if (!prepared.ok) {
    await deps.index.markFailed(id)
    return prepared.outcome
  }

  const result = await deps.placeOrder(prepared.order.input)
  if (result.kind === 'placed') return okOutcome(await recordPlaced(id, request, prepared.order, result, deps), 201)
  if (result.kind === 'refused') {
    await deps.index.markFailed(id)
    // Unanswered checkout questions come back by name, so the app marks the exact question.
    return failOutcome('refused', result.error, result.fieldErrors)
  }
  deps.log.error('app order lost', { tenantId: request.tenantId, id, backend: tenant.backend, error: result.error })
  if (tenant.backend === 'platform') await deps.index.markFailed(id)
  return failOutcome('unavailable', LOST_ORDER)
}

export async function placeAppOrder(request: PlaceAppOrderRequest, deps: PlaceAppOrderDeps): Promise<AppOutcome<AppOrderDetail>> {
  if (request.draft.rewardId !== null) return failOutcome('refused', REWARDS_SOON)
  const tenant = await deps.readTenant(request.tenantId)
  if (!tenant) return failOutcome('unavailable', STORE_UNAVAILABLE)

  const claim = await deps.index.claimOrderKey({
    tenantId: request.tenantId,
    appId: request.tenantId,
    customerId: request.customerId,
    backend: tenant.backend,
    idempotencyKey: request.idempotencyKey,
  })
  switch (claim.kind) {
    case 'claimed':
      return attempt(claim.id, request, tenant, deps)
    case 'placed':
      return okOutcome(toAppOrderDetail(claim.row, await deps.readLive(request.tenantId, claim.row.orderId)))
    case 'placing':
      // Platform dedupes on the key, so a dead attempt can be finished; elsewhere a re-run could double the order.
      if (tenant.backend === 'platform' && (await deps.index.takeOverStalePlacing(claim.row.id, STALE_PLACING_MS)))
        return attempt(claim.row.id, request, tenant, deps)
      return failOutcome('conflict', STILL_PLACING)
    case 'failed':
      if (!(await deps.index.reopenFailed(claim.row.id, tenant.backend))) return failOutcome('conflict', STILL_PLACING)
      return attempt(claim.row.id, request, tenant, deps)
    case 'conflict':
      return failOutcome('bad_request', KEY_CONFLICT)
  }
}
