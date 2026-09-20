/**
 * Per-payment-method control over the checkout payment-details step.
 *
 * The payment-details dialog exists to hand the customer something they need:
 * an account number to copy, a QR code to scan, a screenshot to upload. Cash
 * and cash-on-delivery have none of that, so the dialog is a dead step the
 * customer taps through on the way to placing the order. A merchant can turn
 * it off per method — for cash, and for any other method they settle in person.
 *
 * Strictly opt-in: rows saved before the column existed (undefined/null) and
 * rows with the flag off keep today's behavior exactly. Nothing is inferred
 * from the method's name; the merchant's switch is the only input.
 */

export interface PaymentDetailsStepConfig {
  skip_payment_details?: boolean | null
}

/**
 * Whether checkout should place the order without opening the payment-details
 * step for this method. Unset → no.
 *
 * A method that also requires payment proof still opens the step — the proof
 * UI lives inside it. That precedence is resolved by `resolvePaymentSubmitPlan`,
 * not here.
 */
export function isPaymentDetailsStepSkipped(
  method: PaymentDetailsStepConfig | null | undefined
): boolean {
  return method?.skip_payment_details === true
}
