/**
 * From a raw request to an order every gate accepted, with its lines priced by
 * the server. Nothing here writes; the presell claim (the first write-like
 * step) follows in `placeOrder`.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { withOrderOutlet } from '@/lib/outlets/order-outlet'
import { loadOrderTenantContext } from '@/lib/checkout/load-order-tenant-context'
import { resolveOrderSchedule } from '@/lib/checkout/order-schedule'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import { judgeOrderPaymentMethod, readOrderPaymentMethod } from '@/lib/checkout/order-payment-method'
import {
  REQUIRED_QUESTIONS_TIMEOUT_MS,
  judgeRequiredAnswers,
  readRequiredQuestions,
} from '@/lib/checkout/required-answers-server'
import type { AdmittedOrder } from './context'
import { validateRequest } from './validate-request'
import {
  checkLoyverseStock,
  checkMinimum,
  checkStockShortfall,
  checkStoreOpen,
  judgeOrderType,
  loyverseTenantFrom,
  resolveBranch,
} from './gates'
import { lost, refused, type PlaceOrderFailure, type PlaceOrderInput } from './types'

type Admission = { ok: true; order: AdmittedOrder } | { ok: false; failure: PlaceOrderFailure }

const deny = (failure: PlaceOrderFailure): Admission => ({ ok: false, failure })

export async function admitOrder(input: PlaceOrderInput): Promise<Admission> {
  const request = await validateRequest(input)
  if (!request.ok) return request
  const { tenantId } = input
  let items = request.lines

  // Resolve where this tenant's orders live (Convex or the shared
  // platform DB) AND that the tenant is active — together with
  // its secrets and the chosen order type, in one parallel batch. Credentials
  // live in tenant_secrets, never on the anon-readable tenants row: the
  // Convex deploy key routes the order and the Loyverse token backs the live
  // stock check below.
  const supabaseAdmin = createAdminClient()
  // The chosen payment method, read alongside (one primary-key read; never
  // rejects). Judged once the order type is known, below.
  const paymentMethodRead = readOrderPaymentMethod(supabaseAdmin, tenantId, input.paymentMethodId)
  // The store's required checkout questions for this order type, read on a
  // timed client alongside (never rejects; a failed read has no opinion).
  const requiredQuestionsRead = readRequiredQuestions(
    createAdminClient({ timeoutMs: REQUIRED_QUESTIONS_TIMEOUT_MS }),
    tenantId,
    input.orderTypeId,
  )
  const tenantContext = await loadOrderTenantContext(supabaseAdmin, tenantId, input.orderTypeId)
  if (!tenantContext.ok) {
    // A database hiccup is not a verdict on the store: unmarked, so the
    // checkout retries and the customer keeps the Messenger fallback.
    return deny(
      tenantContext.reason === 'unavailable'
        ? lost('We could not reach the store just now. Please try again.')
        : refused('Restaurant not found or is currently inactive')
    )
  }
  const { tenantConfig, tenantSecrets } = tenantContext

  // A Senior/PWD claim is 20% + VAT off for anyone who types an ID, with no
  // session: orders carrying one the store will price (well-formed, online
  // claims on) are limited per client IP (fail open).
  const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')
  const claimRefusal = await govClaimLimitRefusal(tenantId, input.governmentClaim, async () => {
    const { createSupabaseLedgerStore } = await import('@/lib/gov-discount-ledger/supabase-store')
    const profile = await createSupabaseLedgerStore(supabaseAdmin).loadTaxProfile(tenantId)
    return profile?.onlineClaimsEnabled === true
  })
  if (claimRefusal) return deny(refused(claimRefusal))

  const orderType = await judgeOrderType(tenantContext.orderType, tenantConfig)
  if (!orderType.ok) return orderType
  const orderTypeRow = orderType.value

  // ── Required checkout questions (authoritative; every backend) ──
  // The form refuses to submit with a required answer blank, but this is a
  // public action: a forged request or a tab opened before the owner made a
  // question required used to be written anyway. Judged with the form's own
  // `isAnswered` on the answers as received, against the STORE's questions
  // for this order type, before anything is claimed or written. The checkout
  // preflights the same verdict (preflightCheckoutAnswersAction) ahead of
  // its optimistic "Order placed!" screen.
  const answersVerdict = judgeRequiredAnswers(
    orderTypeRow ? await requiredQuestionsRead : { ok: true, questions: [] },
    request.clientCustomerData,
  )
  if (!answersVerdict.ok) {
    console.warn('[createOrderAction] Refused an order missing required answers', {
      tenantId,
      orderTypeId: input.orderTypeId,
      fields: answersVerdict.fieldErrors.map((error) => error.fieldName),
    })
    return deny(refused(answersVerdict.message, answersVerdict.fieldErrors))
  }

  // ── Payment method (authoritative; every backend) ──
  // Only the id is believed. The method must be one the storefront offers
  // for this order type, and the STORED name / account details / QR are
  // what the order records — the browser's copies used to be stored as sent.
  // A proof-required method needs a screenshot or a reference, the same rule
  // the checkout preflights (`isPaymentProofMissing`) before "Order Placed!".
  const paymentVerdict = judgeOrderPaymentMethod({
    requestedId: input.paymentMethodId,
    read: await paymentMethodRead,
    orderTypeId: orderTypeRow ? input.orderTypeId : null,
    proof: request.paymentProof,
  })
  if (paymentVerdict.kind === 'refuse') return deny(refused(paymentVerdict.error))
  if (paymentVerdict.kind === 'abort') return deny(lost(paymentVerdict.error))

  const loyverseTenant = loyverseTenantFrom(tenantConfig, tenantSecrets, tenantId)
  const loyverseRefusal = await checkLoyverseStock(loyverseTenant, tenantId, items)
  if (loyverseRefusal) return deny(loyverseRefusal)

  // ── Advance-order schedule validation (authoritative; covers EVERY backend) ──
  const schedule = resolveOrderSchedule({
    scheduledForISO: input.scheduledForISO,
    orderTypeId: input.orderTypeId,
    orderTypeRow,
    items,
    customerData: request.clientCustomerData,
    now: new Date(),
  })
  const validatedScheduledISO = schedule.scheduledISO

  const closedRefusal = checkStoreOpen(tenantConfig, validatedScheduledISO)
  if (closedRefusal) return deny(closedRefusal)

  const branch = await resolveBranch(supabaseAdmin, tenantConfig, tenantId, input.outletId)
  if (!branch.ok) return branch
  const resolvedOutlet = branch.value.outlet

  // Convex and tenant-owned Supabase projects have no outlet column, so the
  // branch rides in customer_data for every backend. Returns the very same
  // object when no branch resolved — see withOrderOutlet.
  const customerData = withOrderOutlet(schedule.customerData, resolvedOutlet)

  // ── SERVER-SIDE PRICE VALIDATION (runs before every backend) ──
  // Each line is held to the price the customer was shown: the dish's
  // effective (sale-aware) price at the chosen branch, plus its options and
  // add-ons priced from the dish's own JSON. The browser's price can only
  // raise that; its subtotal is never used. Priced before the stock guard and
  // the presell claim so a refusal here has nothing to hand back.
  const pricedLines = await loadAndPriceOrderLines(supabaseAdmin, tenantId, items, resolvedOutlet?.id ?? null, {
    modifierGroupsEnabled: tenantConfig.modifier_groups_enabled === true,
  })
  if (!pricedLines.ok) {
    return deny(pricedLines.refused ? refused(pricedLines.error) : lost(pricedLines.error))
  }
  items = pricedLines.lines
  const itemsSubtotal = pricedLines.itemsSubtotal

  const minimumRefusal = checkMinimum(itemsSubtotal, orderTypeRow)
  if (minimumRefusal) return deny(minimumRefusal)

  const shortfallRefusal = await checkStockShortfall(tenantConfig, tenantId, items, resolvedOutlet?.id ?? null)
  if (shortfallRefusal) return deny(shortfallRefusal)

  return {
    ok: true,
    order: {
      input,
      db: supabaseAdmin,
      tenantConfig,
      loyverseTenant,
      orderTypeRow,
      lines: items,
      itemsSubtotal,
      resolvedOutlet,
      resolvedOutletOrigin: branch.value.origin,
      paymentMethod: paymentVerdict.method,
      chatSessionId: request.chatSessionId,
      validatedScheduledISO,
      customerData,
      paymentProof: request.paymentProof,
    },
  }
}
