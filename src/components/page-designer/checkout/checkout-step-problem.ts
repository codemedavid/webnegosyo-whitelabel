/**
 * Step-by-step / accordion checkout designs: whether the customer may leave
 * a step yet, given the blocks on it. Mirrors the checks the place-order
 * button runs (handleProceedToPayment) and the wizard template's per-step
 * gate, so a mistake is shown while its question is still on screen instead
 * of after the customer has moved on. The final button still checks it all.
 */

import { validateCheckoutFields } from '@/lib/checkout-field-validation'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

type StepCheckout = Pick<
  UseCheckoutReturn,
  | 'formFields'
  | 'customerData'
  | 'orderType'
  | 'advanceConfig'
  | 'scheduleMode'
  | 'scheduledForLabel'
  | 'isScheduleValid'
  | 'paymentMethods'
  | 'selectedPaymentMethod'
  | 'tenant'
  | 'shouldAskFulfillment'
>

export function checkoutStepProblem(checkout: StepCheckout, blockIds: readonly string[]): string | null {
  const has = (id: string) => blockIds.includes(`checkout.${id}`)
  if (has('order_type') && checkout.shouldAskFulfillment && !checkout.orderType) return 'Please choose how you’ll get your order'
  if (has('schedule') && checkout.advanceConfig.enabled) {
    const isAsapOk = checkout.advanceConfig.allowAsap && checkout.scheduleMode === 'asap'
    const isScheduledOk = checkout.scheduleMode === 'scheduled' && !!checkout.scheduledForLabel && checkout.isScheduleValid
    if (!isAsapOk && !isScheduledOk) return 'Please choose a date & time for your order'
  }
  if (has('customer') && checkout.orderType) {
    const errors = validateCheckoutFields(checkout.formFields, checkout.customerData)
    if (errors.length) return errors.map((error) => error.message).join(' ')
  }
  if (has('payment') && !checkout.tenant?.qr_handoff_enabled && checkout.paymentMethods.length > 0 && !checkout.selectedPaymentMethod) {
    return 'Please choose how you’ll pay'
  }
  return null
}
