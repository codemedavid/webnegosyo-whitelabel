import type { AppOrderDelivery, AppOrderDraft, AppOrderKind, AppProfile } from '@/lib/app-contract'
import type { CartLineOrderItem } from '@/lib/checkout/order-items-payload'
import type { PaymentMethodWithLinks } from '@/lib/checkout/checkout-config'
import type { PlaceOrderInput } from '@/lib/checkout/place-order/types'
import { questionRole } from '@/lib/checkout/question-roles'
import { ANSWER_KEYS_THE_SERVER_CANNOT_SEE } from '@/lib/checkout/required-answers'
import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { isOrderTypeOrderableOnWeb } from '@/lib/order-types/order-type-availability'
import { isOrderTypeKind } from '@/lib/order-types/order-type-kinds'
import type { OrderType } from '@/lib/app-api/store-types'
import { decodeAppQuoteToken } from '../delivery/quote-token'
import { projectQuestions, type CheckoutQuestionRow } from '../project-catalog'

/**
 * An app draft → the engine's `PlaceOrderInput`, with the checks only the app
 * path needs (the engine re-checks everything else). Pure.
 *
 * customerData carries the keys the web checkout writes, and nothing invented:
 *   - `customer_name`, `customer_phone` — the seeded checkout fields
 *     (`order-types/default-form-fields.ts`), from the SESSION, never the body;
 *   - `delivery_address` + `delivery_lat` / `delivery_lng` as strings — what
 *     the address widget stores (`checkout/customer-field-input.ts`
 *     `applyDeliveryAddressChange`), read back by the fee, the Lalamove
 *     signature check and the receipt;
 *   - `notes` — the order-level note, shown as "Notes" in the order card's
 *     checkout answers and on the receipt (`customer-details.ts`). Stores name
 *     their own note question; `notes` is the plain spelling those use;
 *   - the store's own checkout questions, under each question's own name:
 *     answers the app sent for the questions the catalog asked
 *     (`projectQuestions`), and name / phone / address questions spelled the
 *     store's way ("Contact Number") answered from the session and the
 *     picked place (`question-roles.ts`). They go FIRST, so the keys above win.
 * The app channel is `orders.source` (`channel: 'app'`), not a customerData key.
 */

export const REWARDS_SOON = 'Rewards at checkout are coming soon. Remove the reward and try again.'
export const ORDER_TYPE_GONE = 'That way of ordering is not available right now. Choose another one.'
export const PAYMENT_GONE = 'That payment method is not available for this order. Choose another one.'
export const PAYMENT_NEEDED = 'Choose how you will pay for this order.'
export const PROOF_NEEDED = 'Enter the reference number of your payment to continue.'
export const DELIVERY_NEEDED = 'Choose your delivery address from the suggestions.'
export const QUOTE_NEEDED = 'Your delivery quote has expired. Choose your address again to get a new one.'

export interface ChosenOrderType {
  id: string
  kind: AppOrderKind
  name: string
  row: OrderType
}

export interface OrderRequestInput {
  tenantId: string
  draft: AppOrderDraft
  idempotencyKey: string
  orderType: ChosenOrderType
  paymentMethods: readonly PaymentMethodWithLinks[]
  /** The store's checkout questions (every order type); absent = none. */
  questions?: readonly CheckoutQuestionRow[]
  profile: AppProfile
  isLalamoveStore: boolean
  lines: CartLineOrderItem[]
  /** The branch load-draft validated; null for a store without branches. */
  outletId: string | null
}

export type OrderRequest =
  | { ok: true; input: PlaceOrderInput; paymentMethodName: string | null }
  | { ok: false; message: string }

const refuse = (message: string): OrderRequest => ({ ok: false, message })

/** The store's enabled, web-orderable order type by id, or null. */
export function chooseOrderType(orderTypes: readonly OrderType[], orderTypeId: string): ChosenOrderType | null {
  const row = orderTypes.find((candidate) => candidate.id === orderTypeId)
  if (!row || row.is_enabled === false || !isOrderTypeOrderableOnWeb(row) || !isOrderTypeKind(row.type)) return null
  return { id: row.id, kind: row.type, name: row.name, row }
}

/**
 * The active methods checkout offers for the order type: those linked to it
 * (the web's `groupPaymentMethodsByOrderType` — an unlinked method is offered
 * for no order type).
 */
export function offeredPaymentMethods(methods: readonly PaymentMethodWithLinks[], orderTypeId: string): PaymentMethodWithLinks[] {
  return methods.filter(
    (method) => method.is_active !== false && (method.payment_method_order_types ?? []).some((link) => link.order_type_id === orderTypeId),
  )
}

/** The active method linked to the order type, as checkout offers it. */
export function choosePaymentMethod(
  methods: readonly PaymentMethodWithLinks[],
  paymentMethodId: string,
  orderTypeId: string,
): PaymentMethodWithLinks | null {
  return offeredPaymentMethods(methods, orderTypeId).find((candidate) => candidate.id === paymentMethodId) ?? null
}

interface QuestionAnswers {
  orderTypeId: string
  questions: readonly CheckoutQuestionRow[]
  answers: Readonly<Record<string, string>> | undefined
}

/**
 * The store's questions for this order type, answered: what the app sent for
 * the questions it was asked (anything else is dropped), and name / phone /
 * address questions spelled the store's way filled from the session and place.
 */
export function questionAnswers(profile: AppProfile, delivery: AppOrderDelivery | null, input: QuestionAnswers): Record<string, string> {
  const asked = new Set(projectQuestions(input.questions, new Set([input.orderTypeId])).map((question) => question.name))
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.answers ?? {})) {
    const answer = typeof value === 'string' ? value.trim() : ''
    if (asked.has(name) && answer !== '') result[name] = answer
  }
  const known: Record<'name' | 'phone' | 'address', string | null> = {
    name: profile.name?.trim() || null,
    phone: profile.phoneE164,
    address: delivery?.address ?? null,
  }
  for (const row of input.questions) {
    const name = row.field_name ?? ''
    if (row.order_type_id !== input.orderTypeId || name.trim() === '' || ANSWER_KEYS_THE_SERVER_CANNOT_SEE.has(name)) continue
    const role = questionRole(name)
    if (role !== 'name' && role !== 'phone' && role !== 'address') continue
    const value = known[role]
    if (value) result[name] = value
  }
  return result
}

/** The customer data the web writes for the same answers (see the header). */
export function buildAppCustomerData(
  profile: AppProfile,
  delivery: AppOrderDelivery | null,
  notes: string,
  questions?: QuestionAnswers,
): Record<string, string> {
  const trimmedNotes = notes.trim()
  return {
    ...(questions ? questionAnswers(profile, delivery, questions) : {}),
    ...(profile.name ? { customer_name: profile.name } : {}),
    customer_phone: profile.phoneE164,
    ...(delivery
      ? { [DELIVERY_ADDRESS_FIELD_NAME]: delivery.address, delivery_lat: String(delivery.lat), delivery_lng: String(delivery.lng) }
      : {}),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  }
}

function lalamoveFields(delivery: AppOrderDelivery): Pick<PlaceOrderInput, 'lalamoveQuotationId' | 'lalamoveQuoteSignature'> | null {
  const parts = decodeAppQuoteToken(delivery.quoteToken)
  return parts ? { lalamoveQuotationId: parts.quotationId, lalamoveQuoteSignature: parts.signature } : null
}

function proofOf(method: PaymentMethodWithLinks, reference: string | null) {
  if (reference) return { ok: true as const, proof: { reference } }
  return method.require_payment_proof === true ? { ok: false as const } : { ok: true as const, proof: undefined }
}

type PaymentChoice = { ok: true; fields: Partial<PlaceOrderInput>; name: string | null } | { ok: false; message: string }

/**
 * What the order carries about payment. No method is sent only when the order
 * type offers none: the web checkout then places the order without one
 * (`resolvePaymentSubmitPlan` → 'submit-order') and the store settles it in person.
 */
function choosePayment(request: OrderRequestInput): PaymentChoice {
  const { draft, orderType } = request
  if (draft.paymentMethodId === null) {
    return offeredPaymentMethods(request.paymentMethods, orderType.id).length === 0
      ? { ok: true, fields: {}, name: null }
      : { ok: false, message: PAYMENT_NEEDED }
  }
  const method = choosePaymentMethod(request.paymentMethods, draft.paymentMethodId, orderType.id)
  if (!method) return { ok: false, message: PAYMENT_GONE }
  const proof = proofOf(method, draft.paymentReference)
  if (!proof.ok) return { ok: false, message: PROOF_NEEDED }
  return {
    ok: true,
    name: method.name,
    fields: {
      // Only the id: the engine records the STORED name, details and QR.
      paymentMethodId: method.id,
      ...(proof.proof ? { paymentProof: proof.proof } : {}),
    },
  }
}

export function buildPlaceOrderInput(request: OrderRequestInput): OrderRequest {
  const { draft, orderType, profile } = request
  if (draft.rewardId !== null) return refuse(REWARDS_SOON)

  const payment = choosePayment(request)
  if (!payment.ok) return refuse(payment.message)

  const isDelivery = orderType.kind === 'delivery'
  const delivery = isDelivery ? draft.delivery : null
  if (isDelivery && !delivery) return refuse(DELIVERY_NEEDED)
  const lalamove = delivery && request.isLalamoveStore ? lalamoveFields(delivery) : null
  if (delivery && request.isLalamoveStore && !lalamove) return refuse(QUOTE_NEEDED)

  return {
    ok: true,
    paymentMethodName: payment.name,
    input: {
      tenantId: request.tenantId,
      items: request.lines,
      customerInfo: { name: profile.name ?? undefined, contact: profile.phoneE164 },
      orderTypeId: orderType.id,
      customerData: buildAppCustomerData(profile, delivery, draft.notes, {
        orderTypeId: orderType.id,
        questions: request.questions ?? [],
        answers: draft.answers,
      }),
      ...(lalamove ?? {}),
      ...payment.fields,
      ...(request.outletId ? { outletId: request.outletId } : {}),
      ...(draft.voucherCode ? { voucherCodes: [draft.voucherCode] } : {}),
      clientOrderId: request.idempotencyKey,
      channel: 'app',
    },
  }
}
