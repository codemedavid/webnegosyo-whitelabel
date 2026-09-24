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
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { CheckoutTemplateRenderer } from '@/components/customer/checkout-templates'
import {
  CheckoutLoading,
  CheckoutNotFound,
  CheckoutConfirmation,
  PaymentDetailsDialog,
  QrCodeDialog,
} from '@/components/customer/checkout-templates/checkout-shared'
import { CheckoutOutletSummary } from '@/components/customer/checkout-templates/checkout-outlet-section'
import { CheckoutOutletScreen } from '@/components/customer/checkout-templates/checkout-outlet-screen'
import { SeniorOrderSteps } from '@/components/customer/senior-mode/senior-order-steps'
import type { CheckoutTemplate } from '@/lib/checkout-templates'
import { isOrderSaveFailed } from '@/lib/checkout/order-save-outcome'

export default function CheckoutPage() {
  const params = useParams()
  const tenantSlug = params.tenant as string
  const checkout = useCheckout(tenantSlug)

  // Order confirmation / thank-you view (shared across all designs)
  if (checkout.checkoutComplete && checkout.completedOrderData) {
    // Senior mode: "Step 4 of 4: Order sent" — unless the save failed, where
    // the customer is still at step 3 and the screen below says why.
    const hasOrderSaved = !isOrderSaveFailed(checkout)
    return (
      <>
        <SeniorOrderSteps current={hasOrderSaved ? 'done' : 'checkout'} branding={checkout.branding} />
        <CheckoutConfirmation checkout={checkout} />
      </>
    )
  }

  // Merchants who moved the branch question to checkout: it gets the screen to
  // itself, exactly as the pre-menu splash does, rather than sitting as one more
  // field on the form. The form is not rendered behind it — an unanswerable
  // order should not be half-visible, and the CTA must be unreachable, not just
  // covered. Returns to this state whenever the customer taps "Change".
  //
  // Deliberately ahead of the loading screen. Checkout loads in a chain —
  // tenant, then order types, then form fields and payment methods — and the
  // branch question needs only the first two. Waiting out the rest left the
  // customer watching a spinner before being asked something the app could
  // already ask; the form now finishes arriving behind this screen while they
  // answer it. The hook reports its OWN readiness, so this never renders an
  // empty picker.
  if (checkout.outlet.isMissingRequiredSelection) {
    return <CheckoutOutletScreen outlet={checkout.outlet} />
  }

  if (checkout.isLoading) return <CheckoutLoading />
  if (!checkout.tenant) return <CheckoutNotFound />

  const template = (checkout.tenant.checkout_template || 'classic') as CheckoutTemplate

  return (
    <>
      <div data-branding-scope="checkout/colors">
        <SeniorOrderSteps
          current="checkout"
          branding={checkout.branding}
          backLabel="Back to cart"
          onBack={() => checkout.router.push(`/${tenantSlug}/cart`)}
        />
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <CheckoutOutletSummary outlet={checkout.outlet} />
        </div>
        <CheckoutTemplateRenderer template={template} checkout={checkout} />
      </div>
      {/* Shared overlays — rendered for every design */}
      <PaymentDetailsDialog checkout={checkout} />
      <QrCodeDialog checkout={checkout} />
      {/* Branding Studio click-to-inspect (dormant outside the editor iframe) */}
      <BrandingInspector />
    </>
  )
}
