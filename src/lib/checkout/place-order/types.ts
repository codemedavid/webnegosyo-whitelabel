/**
 * The order engine's contract: what a caller hands `placeOrder` and what it
 * gets back. The web checkout (`createOrderAction`) and the customer app both
 * go through the same engine — never a copy of it.
 */

import type { createOrder, createOrderConvex } from '@/lib/orders-service'
import type { TenantOrderWriteResult } from '@/lib/tenant-supabase-orders'
import type { OrderBackend } from '@/lib/order-backend'
import type { OnlineOrderSource } from '@/lib/order-parity'
import type { FieldValidationError } from '@/lib/checkout/required-answers'

/** One cart line as a caller submits it. Every money field is only a claim. */
export interface PlaceOrderLineInput {
  menu_item_id: string
  menu_item_name: string
  variation?: string
  addons: string[]
  quantity: number
  price: number
  subtotal: number
  special_instructions?: string
  // Selected option / addon ids, carried alongside the display strings so
  // inventory can spend what an option adds. Optional: callers that predate
  // this (mobile apps, older clients) simply deplete base recipes.
  option_ids?: string[]
  addon_ids?: string[]
  addon_quantities?: Record<string, number>
  isUpsellItem?: boolean
  isBundleItem?: boolean
  bundleId?: string
  bundleName?: string
  slotName?: string
  /** YYYY-MM-DD pickup date for a presell line (see src/lib/presell). */
  presell_date?: string
}

/** Where the order was placed. Drives `orders.source`, nothing else. */
export type OrderChannel = 'web' | 'app'

/**
 * `orders.source` per channel — the column Reports (`toSaleChannel`: mobile →
 * "Customer app"), Convex `summarizeOrderChannels` and the merchant app's
 * channel split already read. Both the platform check constraint and the
 * Convex schema accept these values.
 */
export const ORDER_SOURCE_BY_CHANNEL = {
  web: 'web',
  app: 'mobile',
} as const satisfies Record<OrderChannel, OnlineOrderSource>

export interface PlaceOrderPaymentProof {
  url?: string | null
  publicId?: string | null
  reference?: string | null
}

export interface PlaceOrderInput {
  tenantId: string
  /** Untrusted until `parseOrderLines` accepts it (this backs a public action). */
  items: PlaceOrderLineInput[]
  customerInfo?: {
    name?: string
    contact?: string
  }
  orderTypeId?: string
  customerData?: Record<string, unknown>
  deliveryFee?: number
  lalamoveQuotationId?: string
  /**
   * Only the id is believed: the order records the STORED method's name,
   * account details and QR (see `judgeOrderPaymentMethod`).
   */
  paymentMethodId?: string
  scheduledForISO?: string
  paymentProof?: PlaceOrderPaymentProof
  /**
   * The branch the customer chose, as claimed by their browser. Re-validated
   * here against the tenant's own outlets — never trusted as sent. Ignored
   * entirely unless the tenant enabled multi-branch.
   */
  outletId?: string
  /**
   * Voucher codes as the customer typed them. CODES, never amounts — the
   * discount is recomputed here from the tenant's own voucher rows, the same
   * way the delivery fee and the outlet id are re-validated rather than
   * trusted. A client-supplied amount would let anyone check out for nothing.
   */
  voucherCodes?: string[]
  /**
   * One id per checkout attempt, minted by the client. A retry of the SAME
   * attempt (flaky network, double tap) reuses it, so the insert's unique
   * index turns the second write into a lookup of the first order instead of
   * a duplicate sale. A fresh attempt mints a fresh id, so a customer who
   * genuinely orders twice still gets two orders.
   */
  clientOrderId?: string
  /**
   * The signature `createQuotationAction` put on the Lalamove price. A Lalamove
   * delivery order must carry a quotation and is billed the SIGNED price;
   * without a valid signature it is refused. See delivery-quote-signature.ts.
   */
  lalamoveQuoteSignature?: string
  /**
   * A Senior Citizen / PWD claim: WHO is claiming (kind, name, ID number),
   * never an amount. Priced here against the server's own lines; the ID is
   * checked when the order is handed over. See gov-discount-checkout.
   */
  governmentClaim?: unknown
  /**
   * Which of the order's lines (`line-<index>`) a voucher that discounts N
   * items should land on, by code. Never an amount: it only moves a discount
   * between eligible units, and the engine re-validates it against the
   * server-priced lines (an invalid pick falls back to the cheapest units).
   */
  voucherUnitPicks?: unknown
  /**
   * Server-decided, never read from a request body: the web action has no
   * parameter for it, and the app route sets it itself. Default 'web'.
   */
  channel?: OrderChannel
}

/** The saved order as its backend returned it. */
export type PlacedOrderRow =
  | Awaited<ReturnType<typeof createOrder>>['order']
  | Awaited<ReturnType<typeof createOrderConvex>>['order']
  | TenantOrderWriteResult['order']

export type PlacedOrderToken =
  | Awaited<ReturnType<typeof createOrder>>['orderToken']
  | Awaited<ReturnType<typeof createOrderConvex>>['orderToken']
  | TenantOrderWriteResult['orderToken']

/** The server-priced figures the order was saved with (pesos). */
export interface PlacedOrderPricing {
  itemsSubtotal: number
  discountTotal: number
  serviceCharge: number
  deliveryFee: number
  total: number
}

/** One line exactly as it was priced and written. */
export interface PlacedOrderLine {
  menu_item_id: string
  name: string
  quantity: number
  price: number
  subtotal: number
  variation?: string
  addons: string[]
}

export interface PlacedOrder {
  kind: 'placed'
  order: PlacedOrderRow
  orderToken: PlacedOrderToken
  /** The customer's tracking token; undefined when API_SECRET is missing. */
  trackingToken: string | undefined
  /** True when a retry of the same `clientOrderId` found the first order (platform only). */
  deduped: boolean
  backend: OrderBackend
  pricing: PlacedOrderPricing
  lines: PlacedOrderLine[]
}

/**
 * The store saying no on purpose. `error` is written for a diner and names
 * what to change, so the checkout shows it verbatim — and does NOT offer
 * the Messenger message, which would deliver an order we just rejected.
 */
export interface RefusedOrder {
  kind: 'refused'
  error: string
  /** Required checkout questions left blank, one per field (shown beside it). */
  fieldErrors?: FieldValidationError[]
}

/**
 * The order genuinely going missing. `error` is diagnostic, not customer
 * copy, so the checkout keeps its own generic wording and keeps offering
 * the Messenger message — the merchant's last remaining copy of the order.
 */
export interface LostOrder {
  kind: 'lost'
  error: string
}

export type PlaceOrderFailure = RefusedOrder | LostOrder

export type PlaceOrderResult = PlacedOrder | PlaceOrderFailure

export function refused(error: string, fieldErrors?: FieldValidationError[]): RefusedOrder {
  return fieldErrors ? { kind: 'refused', error, fieldErrors } : { kind: 'refused', error }
}

export function lost(error: string): LostOrder {
  return { kind: 'lost', error }
}
