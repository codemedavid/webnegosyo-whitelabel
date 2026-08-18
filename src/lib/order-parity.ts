/**
 * Convex-parity columns for the platform write path.
 *
 * The parity migration (20260727130000) and the vouchers migration added
 * reporting/idempotency columns that the mobile adapter populates but the web
 * `createOrder` never did. This pure core builds them so the insert stays a
 * spread and every downstream reader (mobile order mapper, discount
 * reporting, upsell analytics) sees the same shape from both writers.
 */
import type { OrderDiscountPayload } from '@/lib/order-discount'

/** The per-line flags web checkout already sends alongside each cart item. */
export interface ParityOrderItem {
  quantity: number
  isUpsellItem?: boolean
  isBundleItem?: boolean
  bundleId?: string
  bundleName?: string
  slotName?: string
}

/**
 * Longest accepted client order id. The value lands in a unique index; the
 * expected form is a UUID (36 chars), so anything wildly longer is garbage —
 * dropped rather than rejected, because dedupe is an optimization and must
 * never fail an order.
 */
const MAX_CLIENT_ORDER_ID_LENGTH = 64

export interface OrderParityColumns {
  source: 'web'
  item_count: number
  has_upsell_items: boolean
  has_bundle_items: boolean
  client_order_id: string | null
  discount_total: number
  discount_data: OrderDiscountPayload | null
}

export function buildOrderParityColumns(
  items: readonly ParityOrderItem[],
  options: {
    clientOrderId?: string | null
    discountPayload?: OrderDiscountPayload | null
  }
): OrderParityColumns {
  const trimmedId = typeof options.clientOrderId === 'string' ? options.clientOrderId.trim() : ''
  const clientOrderId =
    trimmedId !== '' && trimmedId.length <= MAX_CLIENT_ORDER_ID_LENGTH ? trimmedId : null

  const discountPayload = options.discountPayload ?? null

  return {
    source: 'web',
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    has_upsell_items: items.some((item) => item.isUpsellItem === true),
    has_bundle_items: items.some((item) => item.isBundleItem === true),
    client_order_id: clientOrderId,
    discount_total: discountPayload ? discountPayload.total : 0,
    discount_data: discountPayload,
  }
}

export interface OrderItemParityColumns {
  is_upsell_item: boolean
  is_bundle_item: boolean
  bundle_id: string | null
  bundle_name: string | null
  slot_name: string | null
}

export function buildOrderItemParityColumns(item: ParityOrderItem): OrderItemParityColumns {
  return {
    is_upsell_item: item.isUpsellItem === true,
    is_bundle_item: item.isBundleItem === true,
    bundle_id: item.bundleId ?? null,
    bundle_name: item.bundleName ?? null,
    slot_name: item.slotName ?? null,
  }
}

/** The partial unique index the parity migration created for retry dedupe. */
const CLIENT_ORDER_ID_INDEX = 'orders_tenant_client_order_id_uq'

/**
 * True when an insert failed because THIS client order id already landed —
 * the one case where returning the existing row is correct. Any other
 * violation stays a real error; swallowing it would hide genuine defects.
 */
export function isDuplicateClientOrderId(
  error: { code?: string | null; message?: string | null } | null | undefined,
  clientOrderId: string | null | undefined
): boolean {
  if (!clientOrderId) return false
  if (!error || error.code !== '23505') return false
  return (error.message ?? '').includes(CLIENT_ORDER_ID_INDEX)
}
