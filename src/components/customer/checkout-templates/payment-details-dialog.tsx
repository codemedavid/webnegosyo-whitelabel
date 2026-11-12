'use client'

/**
 * The payment step's overlay gate (shared across every checkout design).
 *
 * Mounts the step (and its effects) only while it is open, for every layout
 * that sits OVER the checkout — bottom sheet, pop-up card, full screen. The
 * "Its own screen" layout replaces the form instead, so the checkout view
 * renders it in place (see `checkout-view.tsx`) and this gate stays empty.
 *
 * The step itself, its layouts and its money lines: `./payment-step.tsx`.
 */

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { PaymentStep } from './payment-step'
import { usePaymentStep } from './payment-step-state'

export function PaymentDetailsDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const step = usePaymentStep(checkout)
  if (!step || step.style.options.layout === 'screen') return null
  return <PaymentStep checkout={checkout} method={step.method} style={step.style} isPreview={step.isPreview} />
}

/** The "Its own screen" layout, when open: rendered by the checkout view in place of the form. */
export function PaymentStepScreen({ checkout }: { checkout: UseCheckoutReturn }) {
  const step = usePaymentStep(checkout)
  if (!step || step.style.options.layout !== 'screen') return null
  return <PaymentStep checkout={checkout} method={step.method} style={step.style} isPreview={step.isPreview} />
}

/** Whether the "Its own screen" step is showing (the form hides behind it, still mounted). */
export function useIsPaymentScreenOpen(checkout: UseCheckoutReturn): boolean {
  const step = usePaymentStep(checkout)
  return step?.style.options.layout === 'screen'
}
