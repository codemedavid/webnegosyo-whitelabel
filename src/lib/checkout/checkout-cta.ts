/**
 * The primary checkout button's label, from checkout state.
 *
 * Classic, the shared CheckoutCTA and BiteSpeed each re-derived this — find the
 * chosen method, then ask `resolveCheckoutCtaLabel` — so a rule added to one
 * could miss the others. Every design now names the next step through here.
 */
import { isAfterBillingPaymentEnabled, type AfterBillingOrderTypeConfig } from '@/lib/after-billing-payment'
import { resolveCheckoutCtaLabel } from '@/lib/messenger-availability'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { PaymentMethod } from '@/types/database'

/** The chosen payment method's row, or null when none (or an unknown id) is chosen. */
export function findSelectedPaymentMethod<T extends Pick<PaymentMethod, 'id'>>(
  paymentMethods: readonly T[],
  selectedPaymentMethod: string | null
): T | null {
  if (!selectedPaymentMethod) return null
  return paymentMethods.find(method => method.id === selectedPaymentMethod) ?? null
}

export interface PlaceOrderLabelInput {
  paymentMethods: readonly PaymentMethod[]
  selectedPaymentMethod: string | null
  messengerEnabled: boolean
  selectedOrderTypeData: AfterBillingOrderTypeConfig | null | undefined
}

export function resolvePlaceOrderLabel({
  paymentMethods,
  selectedPaymentMethod,
  messengerEnabled,
  selectedOrderTypeData,
}: PlaceOrderLabelInput): string {
  const selectedMethod = findSelectedPaymentMethod(paymentMethods, selectedPaymentMethod)
  return resolveCheckoutCtaLabel({
    hasPaymentMethods: paymentMethods.length > 0,
    isMessengerEnabled: messengerEnabled,
    isAfterBillingPayment: isAfterBillingPaymentEnabled(selectedOrderTypeData),
    requiresPaymentProof: isPaymentProofRequired(selectedMethod),
    skipsPaymentDetails: isPaymentDetailsStepSkipped(selectedMethod),
  })
}
