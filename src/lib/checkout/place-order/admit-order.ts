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
import type { AdmittedOrder } from './context'
import { validateRequest } from './validate-request'
import {
  checkLoyverseStock,
  checkMinimum,
  checkSimpleOptionStock,
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

  // Resolve where this tenant's orders live (Convex / their own Supabase /
  // the shared platform DB) AND that the tenant is active — together with
  // its secrets and the chosen order type, in one parallel batch. Credentials
  // live in tenant_secrets, never on the anon-readable tenants row: the
  // Convex deploy key routes the order and the Loyverse token backs the live
  // stock check below.
  const supabaseAdmin = createAdminClient()
  const tenantContext = await loadOrderTenantContext(supabaseAdmin, tenantId, input.orderTypeId)
  if (!tenantContext.ok) return deny(refused('Restaurant not found or is currently inactive'))
  const { tenantConfig, tenantSecrets } = tenantContext

  const optionStockRefusal = await checkSimpleOptionStock(tenantConfig, tenantId, items)
  if (optionStockRefusal) return deny(optionStockRefusal)

  const orderType = await judgeOrderType(tenantContext.orderType, tenantConfig)
  if (!orderType.ok) return orderType
  const orderTypeRow = orderType.value

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
  const resolvedOutlet = branch.value

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
  const pricedLines = await loadAndPriceOrderLines(supabaseAdmin, tenantId, items, resolvedOutlet?.id ?? null)
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
      validatedScheduledISO,
      customerData,
      paymentProof: request.paymentProof,
    },
  }
}
