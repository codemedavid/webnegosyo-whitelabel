import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { appOrderDraftSchema, appVoucherPreviewRequestSchema } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { gateAppCustomer, type CustomerBudgets } from '@/lib/app-api/delivery/customer-gate'
import { readAppJson } from '@/lib/app-api/request-body'
import { appFail, appOk } from '@/lib/app-api/respond'
import { AppReadError } from '@/lib/app-api/store-reads'
import { readOrderTypes, readPaymentMethods } from '@/lib/checkout/load-checkout-config'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import { placeOrder } from '@/lib/checkout/place-order'
import { priceOrderVouchers } from '@/lib/checkout/place-order/pricing'
import { readProfile } from '@/lib/customer-auth/account'
import { createLogger } from '@/lib/logger'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public'
import { generateTrackingToken } from '@/lib/tracking-token'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import { readLiveOrder } from './live-status'
import { loadDraft, readDraftTenant } from './load-draft'
import { createOrderIndex, isValidIdempotencyKey } from './order-index'
import type { AppOutcome } from './outcome'
import { placeAppOrder, type PlaceAppOrderDeps } from './place-app-order'
import { getAppOrder, listAppOrders, type ReadAppOrdersDeps } from './read-app-orders'
import { previewAppVoucher, type VoucherPreviewDeps } from './voucher-preview'

/**
 * HTTP for the app's order routes: the signed-in customer gate (per-customer
 * budgets on top of appRoute's per-IP limit), body/header parsing, and the
 * live dependencies behind the pure-ish steps. Routes stay one line each.
 */

/** Placing orders: a real person places a handful a day; retries of one attempt count too. */
export const ORDER_BUDGETS: CustomerBudgets = {
  bucket: 'app-orders',
  burst: { limit: 5, windowSec: 60 },
  daily: { limit: 40, windowSec: 86_400 },
}

/** Reading orders: the order screen polls every 15 s while an order is active. */
export const ORDER_READ_BUDGETS: CustomerBudgets = {
  bucket: 'app-order-reads',
  burst: { limit: 60, windowSec: 60 },
  daily: { limit: 3000, windowSec: 86_400 },
}

/** "Is this a real code?" is a guessing oracle: kept tight per customer. */
export const VOUCHER_PREVIEW_BUDGETS: CustomerBudgets = {
  bucket: 'app-voucher-preview',
  burst: { limit: 20, windowSec: 60 },
  daily: { limit: 200, windowSec: 86_400 },
}

/** A 50-line draft with picks fits comfortably. */
const MAX_DRAFT_BYTES = 32_768
const NEW_CHECKOUT = 'Something went wrong with this checkout. Please start it again.'
const UNREADABLE_ORDER = "We couldn't read your order. Please update the app and try again."
const UNREADABLE_PREVIEW = "We couldn't check that code. Please update the app and try again."

/** Order answers are per customer and change by the minute: never cached. */
const NO_STORE = { 'Cache-Control': 'private, no-store' }

function respondOutcome<T>(outcome: AppOutcome<T>): NextResponse {
  return outcome.ok ? appOk(outcome.data, { status: outcome.status, headers: NO_STORE }) : appFail(outcome.code, outcome.message)
}

const log = createLogger('[Customer App Orders]', 'DEBUG_CUSTOMER_APP')
const admin = () => createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient

function rethrowAs(source: string) {
  return (caught: unknown): never => {
    throw caught instanceof AppReadError ? caught : new AppReadError(source, caught instanceof Error ? caught.message : String(caught))
  }
}

const readLive = (tenantId: string, orderId: string) =>
  readLiveOrder(tenantId, orderId, { fetchTracking: fetchOrderTrackingContext, mintToken: generateTrackingToken, log })

/** Fresh (uncached) reads, like the web checkout: a stale payment method at checkout is worse than a few ms. */
const storeReads = {
  readTenant: (tenantId: string) => readDraftTenant(admin(), tenantId),
  loadDraft: (tenant: Parameters<typeof loadDraft>[1], request: Parameters<typeof loadDraft>[2]) => loadDraft(admin(), tenant, request),
  readOrderTypes: (tenantId: string) => readOrderTypes(createPublicClient(), tenantId).catch(rethrowAs('order types')),
  readProfile,
}

export function livePlaceDeps(): PlaceAppOrderDeps {
  return {
    ...storeReads,
    index: createOrderIndex(admin(), { log }),
    readPaymentMethods: (tenantId) => readPaymentMethods(createPublicClient(), tenantId).catch(rethrowAs('payment methods')),
    placeOrder,
    readLive,
    log,
  }
}

export function liveReadDeps(): ReadAppOrdersDeps {
  return { index: createOrderIndex(admin(), { log }), readLive, log }
}

export function liveVoucherDeps(): VoucherPreviewDeps {
  const db = admin()
  return {
    ...storeReads,
    priceLines: (tenant, lines, outletId) =>
      loadAndPriceOrderLines(db, tenant.id, lines, outletId, { modifierGroupsEnabled: tenant.modifierGroupsEnabled }),
    priceVouchers: (input) => priceOrderVouchers({ ...input, db: db as unknown as Parameters<typeof priceOrderVouchers>[0]['db'] }),
    voucherLookup: () => createVoucherLookup(db as unknown as Parameters<typeof createVoucherLookup>[0]),
  }
}

/** POST /orders (Idempotency-Key required). */
export async function handlePlaceOrder(context: AppRouteContext, deps?: PlaceAppOrderDeps): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, ORDER_BUDGETS)
  if (!gate.ok) return gate.response
  const idempotencyKey = context.request.headers.get('idempotency-key')?.trim() ?? ''
  if (!isValidIdempotencyKey(idempotencyKey)) return appFail('bad_request', NEW_CHECKOUT)
  const draft = appOrderDraftSchema.safeParse(await readAppJson(context.request, MAX_DRAFT_BYTES))
  if (!draft.success) return appFail('bad_request', UNREADABLE_ORDER)
  const outcome = await placeAppOrder({ tenantId: context.app.tenantId, customerId: gate.customerId, idempotencyKey, draft: draft.data }, deps ?? livePlaceDeps())
  return respondOutcome(outcome)
}

/** GET /orders/[id] — the caller's own order only. */
export async function handleGetOrder(context: AppRouteContext, orderId: string, deps?: ReadAppOrdersDeps): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, ORDER_READ_BUDGETS)
  if (!gate.ok) return gate.response
  return respondOutcome(await getAppOrder({ tenantId: context.app.tenantId, customerId: gate.customerId }, orderId, deps ?? liveReadDeps()))
}

/** GET /me/orders?cursor= — 20 a page, newest first. */
export async function handleListOrders(context: AppRouteContext, deps?: ReadAppOrdersDeps): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, ORDER_READ_BUDGETS)
  if (!gate.ok) return gate.response
  const cursor = context.request.nextUrl.searchParams.get('cursor')
  return respondOutcome(await listAppOrders({ tenantId: context.app.tenantId, customerId: gate.customerId }, cursor || null, deps ?? liveReadDeps()))
}

/** POST /vouchers/preview. */
export async function handleVoucherPreview(context: AppRouteContext, deps?: VoucherPreviewDeps): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, VOUCHER_PREVIEW_BUDGETS)
  if (!gate.ok) return gate.response
  const request = appVoucherPreviewRequestSchema.safeParse(await readAppJson(context.request, MAX_DRAFT_BYTES))
  if (!request.success) return appFail('bad_request', UNREADABLE_PREVIEW)
  return respondOutcome(await previewAppVoucher({ tenantId: context.app.tenantId, customerId: gate.customerId, request: request.data }, deps ?? liveVoucherDeps()))
}
