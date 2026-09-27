'use client'

/**
 * Checkout view (client).
 *
 * All logic lives in useCheckout(); the selected design renders the form;
 * the confirmation screen and payment/QR dialogs are shared. The design is
 * chosen per-tenant via `checkout_template` and lazy-loaded so only that
 * design's chunk ships. Unknown values fall back to 'classic'.
 *
 * Everything it renders from arrives as props from the server page — see
 * ./page.tsx — so nothing waits on a browser fetch.
 */

import { useCheckout, type UseCheckoutInput } from '@/hooks/useCheckout'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { CheckoutTemplateRenderer } from '@/components/customer/checkout-templates'
import {
  CheckoutLoading,
  CheckoutConfirmation,
  PaymentDetailsDialog,
  QrCodeDialog,
} from '@/components/customer/checkout-templates/checkout-shared'
import { CheckoutOutletSummary } from '@/components/customer/checkout-templates/checkout-outlet-section'
import { CheckoutOutletScreen } from '@/components/customer/checkout-templates/checkout-outlet-screen'
import { SeniorOrderSteps } from '@/components/customer/senior-mode/senior-order-steps'
import { resolveCheckoutTemplate } from '@/lib/storefront-packs'
import { isOrderSaveFailed } from '@/lib/checkout/order-save-outcome'

export function CheckoutView({ tenantSlug, initialTenant, config }: UseCheckoutInput) {
  const checkout = useCheckout({ tenantSlug, initialTenant, config })

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
  // Deliberately ahead of the loading screen: the branch question needs only
  // the tenant and its order types, both of which arrive with the page, so
  // the customer is never held on a spinner before being asked it. The hook
  // reports its OWN readiness, so this never renders an empty picker.
  if (checkout.outlet.isMissingRequiredSelection) {
    return <CheckoutOutletScreen outlet={checkout.outlet} />
  }

  if (checkout.isLoading) return <CheckoutLoading />

  const template = resolveCheckoutTemplate(checkout.tenant)

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
