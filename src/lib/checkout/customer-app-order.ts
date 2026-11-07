/**
 * The white-labeled customer app's order, as the web API receives it.
 *
 * The app used to INSERT into `orders` / `order_items` as the anon role, which
 * skipped every check `createOrderAction` makes (server pricing, stock,
 * hours, rate limit). It now posts here instead and the SAME action writes the
 * order through the service role. This module is the pure edge: validate the
 * envelope, map it onto the action's positional arguments, and turn the
 * action's result into the small JSON the app understands.
 *
 * Nothing in the body is a price or an amount the server believes: lines are
 * re-priced, the service charge, delivery fee and total are recomputed.
 */

import { z } from 'zod'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 500
const MAX_URL = 2000
const MAX_CUSTOMER_DATA_KEYS = 100

/** Largest request body accepted, in characters (50 lines of notes fit well inside). */
export const MAX_CUSTOMER_APP_BODY_CHARS = 200_000

const uuid = z.string().regex(UUID_PATTERN)
const optionalText = (max: number) => z.string().max(max).nullish().transform((value) => value ?? undefined)

const customerAppOrderSchema = z.object({
  tenantId: uuid,
  /** One id per checkout attempt: a retried submit finds the first order instead of making a second. */
  clientOrderId: uuid,
  orderTypeId: uuid.nullish().transform((value) => value ?? undefined),
  paymentMethodId: uuid.nullish().transform((value) => value ?? undefined),
  customerInfo: z
    .object({ name: optionalText(MAX_TEXT), contact: optionalText(MAX_TEXT) })
    .optional(),
  customerData: z
    .record(z.string().max(100), z.unknown())
    .refine((data) => Object.keys(data).length <= MAX_CUSTOMER_DATA_KEYS)
    .optional(),
  scheduledForISO: optionalText(64),
  paymentProof: z
    .object({
      url: optionalText(MAX_URL),
      publicId: optionalText(MAX_TEXT),
      reference: optionalText(MAX_TEXT),
    })
    .optional(),
  // Shape-checked by `parseOrderLines` (the action's own boundary) so the two
  // entrances can never disagree about what a line is.
  items: z.array(z.unknown()).min(1),
})

export type CustomerAppOrderRequest = z.infer<typeof customerAppOrderSchema>

export type ParsedCustomerAppOrder =
  | { ok: true; request: CustomerAppOrderRequest }
  | { ok: false; error: string }

const INVALID_REQUEST_MESSAGE = 'We could not read this order. Please update the app and try again.'

/** Validate the envelope. Never throws; `error` is fit to show a diner. */
export function parseCustomerAppOrder(raw: unknown): ParsedCustomerAppOrder {
  const parsed = customerAppOrderSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: INVALID_REQUEST_MESSAGE }
  return { ok: true, request: parsed.data }
}

/** The arguments `createOrderAction` takes, in its positional order. */
export function toCreateOrderActionArgs(request: CustomerAppOrderRequest): unknown[] {
  return [
    request.tenantId,
    request.items,
    request.customerInfo,
    request.orderTypeId,
    request.customerData,
    undefined, // deliveryFee: recomputed on the server
    undefined, // lalamoveQuotationId: the app cannot obtain a signed quote
    request.paymentMethodId,
    undefined, // _clientPaymentMethodName
    undefined, // _clientPaymentMethodDetails
    undefined, // _clientPaymentMethodQrCodeUrl
    undefined, // _clientServiceChargeAmount
    request.scheduledForISO,
    request.paymentProof,
    undefined, // outletId: the app has no branch picker
    undefined, // voucherCodes
    request.clientOrderId,
  ]
}

/** Minimal shape of `createOrderAction`'s answer that this edge reads. */
export interface CreateOrderActionResult {
  success: boolean
  refused?: boolean
  error?: string
  data?: { id?: unknown; daily_number?: unknown } | null
}

export interface CustomerAppOrderResponse {
  status: number
  body:
    | { success: true; orderId: string; dailyNumber: number | null }
    | { success: false; refused: boolean; error: string }
}

const GENERIC_FAILURE_MESSAGE = 'We could not save your order. Please try again or contact the store.'

export function toCustomerAppResponse(result: CreateOrderActionResult): CustomerAppOrderResponse {
  if (result.success) {
    const orderId = typeof result.data?.id === 'string' ? result.data.id : ''
    if (orderId) {
      const dailyNumber = typeof result.data?.daily_number === 'number' ? result.data.daily_number : null
      return { status: 200, body: { success: true, orderId, dailyNumber } }
    }
    // A "success" with no id is not a saved order; the app must not treat it as one.
    return { status: 500, body: { success: false, refused: false, error: GENERIC_FAILURE_MESSAGE } }
  }

  if (result.refused) {
    return {
      status: 422,
      body: { success: false, refused: true, error: result.error || GENERIC_FAILURE_MESSAGE },
    }
  }
  return { status: 500, body: { success: false, refused: false, error: GENERIC_FAILURE_MESSAGE } }
}
