/**
 * Writes a delivery edit to a platform order.
 *
 * The caller decides who may do this and passes the client that proves it: the
 * merchant's session (RLS applies), or the service role after its own check.
 * `customer_data` is one JSON blob that checkout, payment and edits all write,
 * so the update is conditional on `updated_at`: a lost race reports "try again"
 * rather than silently dropping someone else's change. RLS refusals are silent,
 * so the affected row is asserted.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LatLng } from '@/lib/delivery-fee'
import { assessDeliveryPin } from '@/lib/delivery/pin-assessment'
import { loadDeliveryOrigin, ORIGIN_TENANT_COLUMNS, type OriginStore } from '@/lib/delivery/delivery-origin-server'
import { applyDeliveryPatch, deliveryEditRefusal, type DeliveryEditor, type DeliveryPatch } from '@/lib/delivery/order-delivery-edit'
import { createPinLinkToken, pinLinkPath } from '@/lib/delivery/pin-link-token'
import { resolveOrderBackend } from '@/lib/order-backend'
import type { Database } from '@/types/database'

export const DELIVERY_EDIT_PLATFORM_ONLY_MESSAGE = 'Changing delivery details is not available for this store yet.'
const OUTSIDE_COUNTRY_MESSAGE = 'That pin is outside the Philippines. Please choose a spot in the country.'
const RACE_MESSAGE = 'This order just changed. Please try again.'
const UNAVAILABLE_MESSAGE = 'Could not save right now. Please try again.'
export const PIN_LINK_UNAVAILABLE_MESSAGE = 'Pin links are not available right now. Please call the customer for the spot.'

export type DeliveryEditResult =
  | { ok: true; customerData: Record<string, unknown> }
  | { ok: false; status: number; error: string }

export interface SaveDeliveryEditInput {
  tenantId: string
  orderId: string
  patch: DeliveryPatch
  editor: DeliveryEditor
  now?: Date
  /** A branch-locked caller with the service-role client: only their own branch's orders exist for them. */
  isOutletInScope?: (outletId: string | null) => boolean
}

const STORE_COLUMNS = `id, slug, order_backend, convex_deployment_url, lalamove_enabled, lalamove_market, ${ORIGIN_TENANT_COLUMNS}`

interface StoreRow extends OriginStore {
  slug?: string | null
  order_backend?: string | null
  convex_deployment_url?: string | null
  lalamove_enabled?: boolean | null
  lalamove_market?: string | null
}

interface OrderRow {
  id: string
  status: string | null
  outlet_id: string | null
  customer_data: Record<string, unknown> | null
  lalamove_order_id: string | null
  lalamove_status: string | null
  updated_at: string
}

function refused(status: number, error: string): DeliveryEditResult {
  return { ok: false, status, error }
}

async function originFor(client: SupabaseClient<Database>, store: StoreRow, outletId: string | null): Promise<LatLng | null> {
  const found = await loadDeliveryOrigin(client, store, outletId, { isOrderBranch: true })
  return found.ok ? found.origin?.point ?? null : null
}

interface EditableOrder {
  store: StoreRow
  order: OrderRow
}

/** The store and order, if this order's delivery may change now; otherwise why not. */
async function loadEditableOrder(
  client: SupabaseClient<Database>,
  { tenantId, orderId, isOutletInScope }: Pick<SaveDeliveryEditInput, 'tenantId' | 'orderId' | 'isOutletInScope'>,
): Promise<{ ok: true; loaded: EditableOrder } | Extract<DeliveryEditResult, { ok: false }>> {
  const { data: storeData, error: storeError } = await client.from('tenants').select(STORE_COLUMNS).eq('id', tenantId).maybeSingle()
  if (storeError) {
    console.error('[delivery-edit] store read failed:', storeError.message)
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE }
  }
  const store = storeData as unknown as StoreRow | null
  if (!store) return { ok: false, status: 404, error: 'Store not found.' }
  if (resolveOrderBackend(store as Parameters<typeof resolveOrderBackend>[0]) !== 'platform') {
    return { ok: false, status: 409, error: DELIVERY_EDIT_PLATFORM_ONLY_MESSAGE }
  }

  const { data: orderData, error: orderError } = await client
    .from('orders')
    .select('id, status, outlet_id, customer_data, lalamove_order_id, lalamove_status, updated_at')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (orderError) {
    console.error('[delivery-edit] order read failed:', orderError.message)
    return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE }
  }
  const order = orderData as unknown as OrderRow | null
  if (!order || (isOutletInScope && !isOutletInScope(order.outlet_id))) {
    return { ok: false, status: 404, error: 'Order not found.' }
  }

  const refusal = deliveryEditRefusal({ status: order.status, lalamoveOrderId: order.lalamove_order_id, lalamoveStatus: order.lalamove_status })
  if (refusal) return { ok: false, status: 409, error: refusal }
  return { ok: true, loaded: { store, order } }
}

export async function saveOrderDeliveryEdit(client: SupabaseClient<Database>, input: SaveDeliveryEditInput): Promise<DeliveryEditResult> {
  const { tenantId, orderId, patch, editor } = input

  const found = await loadEditableOrder(client, input)
  if (!found.ok) return found
  const { store, order } = found.loaded

  if (patch.pin && assessDeliveryPin({ pin: patch.pin, origin: null, market: store.lalamove_market, lalamoveEnabled: store.lalamove_enabled }).isBlocked) {
    return refused(400, OUTSIDE_COUNTRY_MESSAGE)
  }

  const origin = patch.pin ? await originFor(client, store, order.outlet_id) : null
  const { answers, isDestinationChanged } = applyDeliveryPatch({
    current: order.customer_data ?? {},
    patch,
    editor,
    now: input.now ?? new Date(),
    origin,
  })

  const { data: updated, error: updateError } = await client
    .from('orders')
    .update({
      customer_data: answers,
      // A quote is for the old destination: booking on it would send the rider there.
      ...(isDestinationChanged ? { lalamove_quotation_id: null } : {}),
    } as never)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .eq('updated_at', order.updated_at)
    .select('id')
    .maybeSingle()
  if (updateError) {
    console.error('[delivery-edit] update failed:', updateError.message)
    return refused(503, UNAVAILABLE_MESSAGE)
  }
  if (!updated) return refused(409, RACE_MESSAGE)

  return { ok: true, customerData: answers }
}

export type PinLinkResult = { ok: true; url: string } | { ok: false; status: number; error: string }

/**
 * A link the customer can drop their own pin with. Only for an order whose
 * delivery may still change, so the merchant hears why not before sending it.
 * The link's path carries the store's slug, which works on every host it has.
 */
export async function createOrderPinLink(
  client: SupabaseClient<Database>,
  input: Pick<SaveDeliveryEditInput, 'tenantId' | 'orderId' | 'isOutletInScope'> & { origin: string },
): Promise<PinLinkResult> {
  const found = await loadEditableOrder(client, input)
  if (!found.ok) return found
  const slug = found.loaded.store.slug
  if (!slug) return { ok: false, status: 404, error: 'Store not found.' }
  try {
    return { ok: true, url: `${input.origin}${pinLinkPath(slug, input.orderId, createPinLinkToken(input.orderId))}` }
  } catch (error) {
    // Only a deploy without API_SECRET gets here: say so in the logs, not as a bare 500.
    console.error('[delivery-edit] could not sign a pin link:', error instanceof Error ? error.message : String(error))
    return { ok: false, status: 503, error: PIN_LINK_UNAVAILABLE_MESSAGE }
  }
}
