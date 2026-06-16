'use client'

/**
 * Checkout page shell.
 *
 * All logic lives in useCheckout(); the selected design renders the form;
 * the confirmation screen and payment/QR dialogs are shared. The design is
 * chosen per-tenant via `checkout_template` and lazy-loaded so only that
 * design's chunk ships. Unknown values fall back to 'classic'.
 */

import { useParams } from 'next/navigation'
import { useCheckout } from '@/hooks/useCheckout'
import { CheckoutTemplateRenderer } from '@/components/customer/checkout-templates'
import {
  CheckoutLoading,
  CheckoutNotFound,
  CheckoutConfirmation,
  PaymentDetailsDialog,
  QrCodeDialog,
} from '@/components/customer/checkout-templates/checkout-shared'
import type { CheckoutTemplate } from '@/lib/checkout-templates'

export default function CheckoutPage() {
  const params = useParams()
  const tenantSlug = params.tenant as string
  const checkout = useCheckout(tenantSlug)

  if (checkout.isLoading) return <CheckoutLoading />
  if (!checkout.tenant) return <CheckoutNotFound />

  // Order confirmation / thank-you view (shared across all designs)
  if (checkout.checkoutComplete && checkout.completedOrderData) {
    return <CheckoutConfirmation checkout={checkout} />
  }

  const template = (checkout.tenant.checkout_template || 'classic') as CheckoutTemplate

  return (
    <>
      <CheckoutTemplateRenderer template={template} checkout={checkout} />
      {/* Shared overlays — rendered for every design */}
      <PaymentDetailsDialog checkout={checkout} />
      <QrCodeDialog checkout={checkout} />
    </>
  )
}
