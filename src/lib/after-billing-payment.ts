/**
 * Per-order-type "Pay after billing".
 *
 * Some order types (typically Dine In) settle the bill after the meal. The
 * customer still declares a payment method — the merchant wants it on the
 * ticket — but nothing is paid at checkout, so the payment-details step
 * (account numbers, QR codes, proof upload) must never open. Choosing a
 * method and tapping the CTA places the order directly.
 *
 * Strictly opt-in: rows saved before the column existed (undefined/null) and
 * rows with the flag off keep today's behavior exactly.
 */

export interface AfterBillingOrderTypeConfig {
  after_billing_payment_enabled?: boolean | null
}

/** Whether the selected order type collects payment after billing. Unset → no. */
export function isAfterBillingPaymentEnabled(
  orderType: AfterBillingOrderTypeConfig | null | undefined
): boolean {
  return orderType?.after_billing_payment_enabled === true
}

export type PaymentSubmitPlan = 'blocked-no-method' | 'payment-details' | 'submit-order'

/**
 * The single decision the checkout CTA makes once form validation has passed:
 * block until a method is chosen, open the payment-details step, or submit
 * the order directly.
 */
export function resolvePaymentSubmitPlan({
  hasPaymentMethods,
  hasSelectedPaymentMethod,
  isAfterBillingPayment,
}: {
  hasPaymentMethods: boolean
  hasSelectedPaymentMethod: boolean
  isAfterBillingPayment: boolean
}): PaymentSubmitPlan {
  if (!hasPaymentMethods) return 'submit-order'
  if (!hasSelectedPaymentMethod) return 'blocked-no-method'
  return isAfterBillingPayment ? 'submit-order' : 'payment-details'
}
