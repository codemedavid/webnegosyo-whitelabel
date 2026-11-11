/**
 * The store's own gates: stock, order type, hours, branch and minimum. Each
 * returns a failure to answer with, or null/ok to carry on. All of them run
 * before the presell claim, so a refusal here has nothing to hand back.
 */

import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import {
  isOrderTypeOrderableOnWeb,
  WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE,
} from '@/lib/order-types/order-type-availability'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { requireCheckoutOutlet } from '@/lib/outlets/order-outlet'
import { getClosedOrderError, type StoreHoursSource } from '@/lib/store-open-status'
import type { LoyverseTenant } from '@/lib/loyverse/tenant'
import type { CheckoutOrderTypeRow } from '@/lib/checkout/checkout-order-type'
import type { OrderTypeRead } from '@/lib/checkout/load-order-tenant-context'
import type { OriginOutletFields } from '@/lib/delivery/delivery-origin'
import type { AdminClient, ResolvedOutlet, TenantConfig, TenantSecrets } from './context'
import { lost, refused, type PlaceOrderFailure, type PlaceOrderLineInput } from './types'

type Gate<T> = { ok: true; value: T } | { ok: false; failure: PlaceOrderFailure }

/**
 * ── The order type: ONE tenant-scoped read serves every consumer below ──
 * (web availability, advance schedule, minimum, delivery kind, service
 * charge, and the names the backends and the merchant email carry). Read
 * in the tenant batch; judged here, where it always was.
 */
export async function judgeOrderType(
  orderType: Promise<OrderTypeRead>,
  tenantConfig: TenantConfig
): Promise<Gate<CheckoutOrderTypeRow | null>> {
  const orderTypeRead = await orderType
  if (!orderTypeRead.ok) {
    return { ok: false, failure: lost('Failed to verify the order type') }
  }
  const orderTypeRow: CheckoutOrderTypeRow | null = orderTypeRead.row

  // A type the merchant hid from online ordering (POS-only channels such
  // as Grab) is refused outright — the storefront never offers it, so
  // reaching here means a stale tab or a direct call.
  if (orderTypeRow && !isOrderTypeOrderableOnWeb(orderTypeRow)) {
    return { ok: false, failure: refused(WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE) }
  }

  // An unknown/missing type must not turn off the required delivery gate.
  if (tenantConfig.lalamove_enabled === true && !orderTypeRow) {
    return { ok: false, failure: refused('Please select a valid order type before continuing.') }
  }
  return { ok: true, value: orderTypeRow }
}

/**
 * The Loyverse snapshot the live stock check AND the on-create receipt push
 * use, so a tenant without Loyverse pays for neither.
 */
export function loyverseTenantFrom(
  tenantConfig: TenantConfig,
  tenantSecrets: TenantSecrets | null,
  tenantId: string
): LoyverseTenant | null {
  return tenantConfig.loyverse_enabled === true
    ? {
        id: tenantId,
        loyverse_enabled: true,
        loyverse_access_token: tenantSecrets?.loyverse_access_token ?? null,
        loyverse_store_id: tenantConfig.loyverse_store_id ?? null,
        loyverse_payment_type_id: tenantConfig.loyverse_payment_type_id ?? null,
        loyverse_push_mode: tenantConfig.loyverse_push_mode ?? null,
      }
    : null
}

/**
 * ── Live Loyverse stock verification (authoritative; every order backend) ──
 * The synced mirror can always be stale — a webhook may be unregistered or
 * disabled by Loyverse after 48h of failures. One live read here is the
 * only check that cannot be stale; it asks only for the ordered dishes'
 * variants and is time-bounded, so a slow Loyverse never stalls checkout.
 */
export async function checkLoyverseStock(
  loyverseTenant: LoyverseTenant | null,
  tenantId: string,
  lines: readonly PlaceOrderLineInput[]
): Promise<PlaceOrderFailure | null> {
  const loyverseToken = loyverseTenant?.loyverse_access_token
  const loyverseStoreId = loyverseTenant?.loyverse_store_id
  if (!loyverseToken || !loyverseStoreId) return null

  const { findLiveOutOfStockLines } = await import('@/lib/loyverse/stock-check')
  const blocked = await findLiveOutOfStockLines(
    tenantId,
    loyverseToken,
    loyverseStoreId,
    lines.map((item) => ({
      menu_item_id: item.menu_item_id,
      menu_item_name: item.menu_item_name,
    }))
  )
  if (blocked.length === 0) return null
  const names = blocked.map((line) => line.menu_item_name).join(', ')
  return refused(
    `Sorry, ${names} just went out of stock. Please remove ${blocked.length === 1 ? 'it' : 'them'} from your cart and try again.`
  )
}

/**
 * ── Operating hours / pre-launch (authoritative; covers EVERY backend) ──
 * A closed or not-yet-launched store is the store saying no, so it is
 * answered as a refusal HERE — before the presell claim, so there is
 * nothing to hand back. The backend writers still carry the same guard,
 * but they throw, which the engine reads as a lost order and keeps
 * the Messenger fallback for an order the store never accepts. The tenant
 * Supabase writer has no guard at all. Judged on the VALIDATED schedule:
 * an out-of-policy time is stored as ASAP, so it is judged as ASAP.
 */
export function checkStoreOpen(
  tenantConfig: TenantConfig,
  validatedScheduledISO: string | undefined
): PlaceOrderFailure | null {
  const closedError = getClosedOrderError(tenantConfig as StoreHoursSource, new Date(), {
    isScheduled: !!validatedScheduledISO,
  })
  return closedError ? refused(closedError) : null
}

/**
 * ── Which branch is fulfilling this order (authoritative) ──
 * The browser tells us what the customer picked; we only believe it if the
 * tenant opted in AND the id names one of their own branches. Both
 * conditions are checked before the query runs, so a tenant without the
 * feature issues exactly the queries they issue today.
 */
export async function resolveBranch(
  db: AdminClient,
  tenantConfig: TenantConfig,
  tenantId: string,
  outletId: string | undefined
): Promise<Gate<{ outlet: ResolvedOutlet | null; origin: OriginOutletFields | null }>> {
  if (!isMultiBranchEnabled(tenantConfig)) return { ok: true, value: { outlet: null, origin: null } }

  const { data: outletRows, error: outletError } = await db
    .from('outlets')
    .select('id, name, is_active, address, latitude, longitude, delivery_radius_km')
    .eq('tenant_id', tenantId)
  if (outletError) return { ok: false, failure: lost('Unable to verify your branch. Please try again.') }
  const branchRows = (outletRows ?? []) as Array<OriginOutletFields & { name: string; is_active: boolean }>
  try {
    const outlet = requireCheckoutOutlet({
      isEnabled: true,
      requestedOutletId: outletId,
      outlets: branchRows,
    })
    // The resolved branch's own pin and radius: a delivery starts THERE when
    // it is pinned (fee, Lalamove signature check), else at the store.
    const origin = outlet ? branchRows.find((row) => row.id === outlet.id) ?? null : null
    return { ok: true, value: { outlet, origin } }
  } catch (error) {
    return {
      ok: false,
      failure: refused(error instanceof Error ? error.message : 'Choose a branch before placing your order.'),
    }
  }
}

/**
 * ── Minimum-order enforcement (authoritative; covers EVERY order backend) ──
 * The checkout button is only a courtesy: the mobile apps, a stale tab, and
 * a direct action call all reach here without it. Measured against the
 * SERVER-PRICED item subtotal, so neither a delivery fee nor a forged line
 * subtotal can carry a small cart over a minimum.
 */
export function checkMinimum(
  itemsSubtotal: number,
  orderTypeRow: CheckoutOrderTypeRow | null
): PlaceOrderFailure | null {
  if (!orderTypeRow) return null
  const minimumStatus = checkOrderMinimum(itemsSubtotal, orderTypeRow)
  if (minimumStatus.meets) return null
  return refused(
    formatOrderMinimumMessage(minimumStatus, orderTypeRow.name) ??
      'This order is below the minimum for checkout'
  )
}

/**
 * ── Producible-quantity stock guard (authoritative; every order backend) ──
 * The Loyverse check, and auto-86, both only ever ask "is this dish
 * above zero?" — which stays true right up until the order that empties the
 * shelf is accepted in full. This asks the question a quantity stepper
 * actually poses: can the kitchen make the number in this cart? Flour for
 * two burgers has always accepted a cart of fifty until now.
 *
 * Deliberately run AFTER the branch is resolved: which shelf this is
 * judged against is the branch fulfilling the order, and that is settled
 * from the tenant's own outlets — never from the customer's payload.
 * Silent on every failure path (inventory off, failed read, no recipe).
 * Gated on the flag the engine already read: the guard would otherwise
 * re-read the tenant row just to learn inventory is off — a wasted round
 * trip on every order from a store without inventory.
 */
export async function checkStockShortfall(
  tenantConfig: TenantConfig,
  tenantId: string,
  lines: readonly PlaceOrderLineInput[],
  outletId: string | null
): Promise<PlaceOrderFailure | null> {
  if (tenantConfig.inventory_enabled !== true) return null
  const [{ findCheckoutStockShortfallMessage }, { depletionItemFromCheckoutLine }] = await Promise.all([
    import('@/lib/inventory/checkout-stock-guard'),
    import('@/lib/inventory/order-depletion'),
  ])
  // Each line in its configuration — the option and add-on ids and
  // portions depletion will spend once this order is accepted.
  const shortfallMessage = await findCheckoutStockShortfallMessage(
    tenantId,
    lines.map(depletionItemFromCheckoutLine),
    outletId,
  )
  return shortfallMessage ? refused(shortfallMessage) : null
}
