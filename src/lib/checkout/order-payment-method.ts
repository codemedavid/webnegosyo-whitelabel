/**
 * The payment method a web order carries, decided by the server.
 *
 * The checkout sends the method's id — and, for older builds, its name,
 * account details and QR URL. Only the id is believed: the method is read
 * from the store's own rows and must be one the storefront offers for the
 * order's type (`load-checkout-config.ts`: the tenant's, active, linked via
 * `payment_method_order_types`). The stored name/details/QR are what every
 * backend (platform, tenant Supabase, Convex) then records, so a forged order
 * cannot point the merchant or the receipt at someone else's account.
 *
 * A method with `require_payment_proof` needs a screenshot OR a reference,
 * judged with the checkout preflight's own rule (`getPaymentProofError` in
 * `useCheckout.isPaymentProofMissing`), so this refusal never lands behind
 * the optimistic "Order Placed!" for a customer the preflight let through.
 * It applies to after-billing order types too: `resolvePaymentSubmitPlan`
 * still opens the details step for a proof-required method.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentProofError } from '@/lib/payment-proof'
import type { SanitizedPaymentProof } from '@/lib/checkout/payment-proof-guard'

type AdminClient = ReturnType<typeof createAdminClient>

export const PAYMENT_METHOD_UNAVAILABLE_MESSAGE =
  'This payment method is no longer available. Please choose another one and try again.'

const PAYMENT_METHOD_READ_FAILED = 'Failed to verify the payment method'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PAYMENT_METHOD_SELECT =
  'id, name, details, qr_code_url, is_active, require_payment_proof, payment_method_order_types(order_type_id)'

export interface StoredOrderPaymentMethod {
  id: string
  name: string
  details: string | null
  qr_code_url: string | null
  is_active: boolean
  require_payment_proof: boolean
  order_type_ids: string[]
}

export type PaymentMethodRead = { ok: true; row: StoredOrderPaymentMethod | null } | { ok: false }

/** What the order records about its payment method. */
export interface OrderPaymentMethod {
  id: string
  name: string
  details: string | null
  qrCodeUrl: string | null
}

export type OrderPaymentMethodVerdict =
  | { kind: 'ok'; method: OrderPaymentMethod | null }
  | { kind: 'refuse'; error: string }
  | { kind: 'abort'; error: string }

const NO_METHOD: PaymentMethodRead = { ok: true, row: null }

function isRequestedId(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function toStoredMethod(raw: Record<string, unknown>): StoredOrderPaymentMethod {
  const links = Array.isArray(raw.payment_method_order_types) ? raw.payment_method_order_types : []
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    details: typeof raw.details === 'string' ? raw.details : null,
    qr_code_url: typeof raw.qr_code_url === 'string' ? raw.qr_code_url : null,
    is_active: raw.is_active === true,
    require_payment_proof: raw.require_payment_proof === true,
    order_type_ids: links
      .map((link) => (link as { order_type_id?: unknown })?.order_type_id)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  }
}

/**
 * One primary-key read, tenant-scoped, with its order-type links. Never
 * throws. No id = no read; a malformed id is "not the store's" without a read
 * (Postgres would answer a uuid cast error, which reads as a lost order).
 */
export async function readOrderPaymentMethod(
  client: AdminClient,
  tenantId: string,
  paymentMethodId: unknown,
): Promise<PaymentMethodRead> {
  if (!isRequestedId(paymentMethodId)) return NO_METHOD
  if (!UUID_RE.test(paymentMethodId)) return NO_METHOD
  try {
    const { data, error } = await client
      .from('payment_methods')
      .select(PAYMENT_METHOD_SELECT)
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) {
      console.error('[order-payment-method] read failed', { tenantId, message: error.message })
      return { ok: false }
    }
    return { ok: true, row: data ? toStoredMethod(data as Record<string, unknown>) : null }
  } catch (error) {
    console.error('[order-payment-method] read threw', {
      tenantId,
      message: error instanceof Error ? error.message : String(error),
    })
    return { ok: false }
  }
}

export function judgeOrderPaymentMethod(input: {
  requestedId: unknown
  read: PaymentMethodRead
  orderTypeId: string | null | undefined
  proof: SanitizedPaymentProof | undefined
}): OrderPaymentMethodVerdict {
  if (!isRequestedId(input.requestedId)) return { kind: 'ok', method: null }
  if (!input.read.ok) return { kind: 'abort', error: PAYMENT_METHOD_READ_FAILED }

  const row = input.read.row
  const isOffered =
    row !== null &&
    row.is_active &&
    typeof input.orderTypeId === 'string' &&
    row.order_type_ids.includes(input.orderTypeId)
  if (!row || !isOffered) return { kind: 'refuse', error: PAYMENT_METHOD_UNAVAILABLE_MESSAGE }

  const proofError = getPaymentProofError(row, {
    screenshotUrl: input.proof?.url ?? null,
    reference: input.proof?.reference ?? null,
  })
  if (proofError) return { kind: 'refuse', error: proofError }

  return { kind: 'ok', method: { id: row.id, name: row.name, details: row.details, qrCodeUrl: row.qr_code_url } }
}
