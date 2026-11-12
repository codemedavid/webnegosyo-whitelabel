'use client'

/**
 * Which payment step is on screen, for the checkout view (the "Its own screen"
 * layout replaces the form) and the overlay gate (every other layout).
 *
 * In the Branding Studio's "Payment step" preview the step is held open with
 * a method that asks for proof, so every setting has something to show; the
 * preview never sends an order (see PaymentStep `isPreview`).
 */

import { useMemo } from 'react'
import { useBrandingPreviewDraft } from '@/hooks/use-branding-preview'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { readPaymentStepStyle, type PaymentStepStyle } from '@/lib/payment-step/style'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

type PaymentMethod = UseCheckoutReturn['paymentMethods'][number]

export interface OpenPaymentStep {
  method: PaymentMethod
  style: PaymentStepStyle
  isPreview: boolean
}

/** Shown in the Studio preview when the store has no method with details yet. */
export const SAMPLE_PAYMENT_METHOD = {
  id: 'sample-payment-step',
  name: 'GCash',
  details: 'Account name: Your Store\nNumber: 0917 123 4567',
  qr_code_url: null,
  require_payment_proof: true,
  skip_payment_details: false,
} as unknown as PaymentMethod

/**
 * The method the preview shows: the chosen one, else the first that opens a
 * payment step, else a sample — always asking for proof, so the upload shows.
 */
export function previewPaymentMethod(methods: readonly PaymentMethod[], selectedId: string | null | undefined): PaymentMethod {
  const selected = methods.find((m) => m.id === selectedId && !isPaymentDetailsStepSkipped(m))
  const base = selected ?? methods.find((m) => !isPaymentDetailsStepSkipped(m)) ?? SAMPLE_PAYMENT_METHOD
  return { ...base, require_payment_proof: true }
}

export function usePaymentStep(checkout: UseCheckoutReturn): OpenPaymentStep | null {
  const { showPaymentDetails, selectedPaymentMethod, paymentMethods, tenant } = checkout
  const isPreview = useBrandingPreviewDraft()?.__previewSurface === 'payment'
  const style = useMemo(() => readPaymentStepStyle(tenant as Record<string, unknown> | null), [tenant])

  return useMemo(() => {
    if (isPreview) return { method: previewPaymentMethod(paymentMethods, selectedPaymentMethod), style, isPreview: true }
    const method = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
    if (!showPaymentDetails || !method) return null
    return { method, style, isPreview: false }
  }, [isPreview, paymentMethods, selectedPaymentMethod, showPaymentDetails, style])
}
