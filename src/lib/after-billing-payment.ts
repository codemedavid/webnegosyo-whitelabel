/**
 * Per-order-type "Pay after billing".
 *
 * Some order types (typically Dine In) settle the bill after the meal. The
 * customer still declares a payment method — the merchant wants it on the
 * ticket — but nothing is paid at checkout, so the payment-details step
 * (account numbers, QR codes, proof upload) must not open for methods that
 * do not require proof. If the chosen method requires a screenshot or
 * reference, the details step still opens so checkout can collect it.
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
  requiresPaymentProof = false,
  isQrHandoff = false,
  skipsPaymentDetails = false,
}: {
  hasPaymentMethods: boolean
  hasSelectedPaymentMethod: boolean
  isAfterBillingPayment: boolean
  /** When the chosen method requires a screenshot/reference, the details step
   *  (where that proof is collected) must still open — even for after-billing
   *  and QR-handoff. */
  requiresPaymentProof?: boolean
  /** QR-handoff skips the details step (the vendor rings them up) unless
   *  the chosen method still requires a screenshot. */
  isQrHandoff?: boolean
  /** The chosen method has the details step switched off (cash and the like:
   *  nothing to copy, nothing to scan). Proof still overrides it. */
  skipsPaymentDetails?: boolean
}): PaymentSubmitPlan {
  if (!hasPaymentMethods) return 'submit-order'
  if (!hasSelectedPaymentMethod) return isQrHandoff ? 'submit-order' : 'blocked-no-method'
  if (requiresPaymentProof) return 'payment-details'
  if (isQrHandoff || isAfterBillingPayment || skipsPaymentDetails) return 'submit-order'
  return 'payment-details'
}
