'use client'

/**
 * Shared, design-agnostic checkout views.
 *
 * These pieces are intentionally NOT templated: the success/confirmation
 * screen and the payment/QR dialogs are transient, logic-heavy, and identical
 * across every design. The page shell renders them for ALL checkout designs,
 * so each design only re-skins the pre-submit form experience.
 *
 * Markup is preserved verbatim from the original checkout page to guarantee
 * the experience is unchanged.
 */

import { useMemo } from 'react'
import { QrCode } from 'lucide-react'
import { resolvePageDesign } from '@/lib/page-designer/page-mode'
import { readStorefrontLabels } from '@/lib/storefront-labels'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { computeOrderTotals } from '@/lib/order-totals'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { ConfirmationBlocksProvider } from '@/components/page-designer/confirmation/confirmation-context'
import { DesignedConfirmation } from '@/components/page-designer/confirmation/designed-confirmation'
import { ConfirmationKioskCard, ConfirmationTrackButtons } from '@/components/page-designer/confirmation/parts-actions'
import { ConfirmationMessageBox, ConfirmationMessengerCard } from '@/components/page-designer/confirmation/parts-messenger'
import {
  ConfirmationCustomerCard,
  ConfirmationPaymentCard,
  ConfirmationSummaryCard,
} from '@/components/page-designer/confirmation/parts-order'
import { ConfirmationFailureNotice, ConfirmationHero } from '@/components/page-designer/confirmation/parts-status'
import { useConfirmationValue } from '@/components/page-designer/confirmation/use-confirmation-value'
import { TenantFlashLoading } from '@/components/customer/flash-screen-loader'
import { checkoutThemeStyle } from './checkout-theme'

/**
 * Full-screen loading state (shared across designs).
 *
 * Reuses the tenant's branded flash splash (via TenantFlashLoading, fed by the
 * [tenant] layout's TenantFlashProvider) so the client-side checkout load matches
 * the route-level loading.tsx and the menu. Tenants without the flash feature see
 * a neutral spinner in the app theme (no tenant is known yet, so there is no
 * checkout palette to draw from). Kept propless so it also works
 * as the next/dynamic() `loading` fallback for the lazy design chunks.
 */
export function CheckoutLoading() {
  return <TenantFlashLoading fallback={<CheckoutSpinner />} />
}

function CheckoutSpinner() {
  return (
    <div className="min-h-screen bg-background text-[color:var(--co-muted)] flex items-center justify-center">
      <div className="text-center">
        <div className="h-16 w-16 border-4 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[color:var(--co-muted)]">Loading checkout...</p>
      </div>
    </div>
  )
}

/** Restaurant-not-found state (shared across designs). */
export function CheckoutNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-[color:var(--co-muted)]">Restaurant not found</p>
      </div>
    </div>
  )
}

/**
 * Today's thank-you page, composed from the shared parts in today's order and
 * container, worded by the store's Branding Studio labels. What every store
 * without a published design sees — pinned by
 * tests/unit/page-designer/confirmation-standard-path.test.tsx.
 */
function StandardConfirmation({ isKiosk }: { isKiosk: boolean }) {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <ConfirmationHero copy={{ title: <StoreLabel name="confirmation.title" fallback="Order Placed!" /> }} />
        <ConfirmationFailureNotice />
        <ConfirmationSummaryCard copy={{ title: <StoreLabel name="checkout.summary" fallback="Order Summary" /> }} />
        <ConfirmationCustomerCard title={<StoreLabel name="checkout.customer" fallback="Customer Information" />} />
        <ConfirmationPaymentCard title={<StoreLabel name="checkout.payment" fallback="Payment Method" />} />
        {isKiosk ? (
          <ConfirmationKioskCard />
        ) : (
          <>
            <ConfirmationMessengerCard />
            <ConfirmationMessageBox />
            <ConfirmationTrackButtons />
          </>
        )}
      </div>
    </main>
  )
}

/**
 * Order confirmation / thank-you screen (shared across designs).
 *
 * Built from standalone parts fed by ONE ConfirmationBlocksContext value. With
 * no published Page Designer design it renders today's page exactly
 * (StandardConfirmation); with one, the owner's design renders inside the same
 * `--co-*` themed root.
 */
export function CheckoutConfirmation({ checkout }: { checkout: UseCheckoutReturn }) {
  const { tenant, completedOrderData: order } = checkout
  // The confirmation renders AFTER checkout state is cleared, so it cannot ask
  // the hook — the total is re-derived from the snapshot's parts through the
  // shared arithmetic, once, for the summary and the `{total}` token alike.
  const grandTotal = order
    ? computeOrderTotals({
        subtotal: order.total,
        deliveryFee: order.deliveryFee,
        serviceCharge: order.serviceChargeAmount,
        discounts: order.discounts,
      }).grandTotal
    : 0
  const value = useConfirmationValue(checkout, grandTotal)
  // Parsed once per tenant row, not on every countdown tick.
  const design = useMemo(() => resolvePageDesign(tenant as Record<string, unknown> | null, 'confirmation'), [tenant])
  const labels = useMemo(() => readStorefrontLabels(tenant as Record<string, unknown> | null), [tenant])
  if (!value) return null

  return (
    <div className="min-h-screen bg-[var(--co-bg)] text-[color:var(--co-text)]" style={checkoutThemeStyle(checkout)}>
      <ConfirmationBlocksProvider value={value}>
        {design ? (
          <DesignedConfirmation design={design} tenantSlug={checkout.tenantSlug} labels={labels} />
        ) : (
          <StandardConfirmation isKiosk={value.isKiosk} />
        )}
      </ConfirmationBlocksProvider>
    </div>
  )
}

/**
 * Payment-details sheet shown after "Proceed to Payment". Lives in its own
 * module; re-exported here so the page shell's import path is unchanged.
 */
export { PaymentDetailsDialog } from './payment-details-dialog'

/** Full-size payment QR dialog (shared across designs). */
export function QrCodeDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const { qrDialogOpen, selectedQrCode, setQrDialogOpen } = checkout
  const themeStyle = checkoutThemeStyle(checkout)

  if (!qrDialogOpen || !selectedQrCode) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      style={themeStyle}
      onClick={() => setQrDialogOpen(false)}
    >
      <div
        className="bg-[var(--co-card)] rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-[color:var(--co-text)]">Payment QR Code</h3>
          <button
            onClick={() => setQrDialogOpen(false)}
            className="text-[color:var(--co-muted)] hover:text-[color:var(--co-text)]"
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedQrCode}
          alt="Payment QR Code"
          className="w-full h-auto object-contain rounded bg-white"
        />
        <p className="text-sm text-[color:var(--co-muted)] text-center mt-4">
          Scan this QR code with your payment app
        </p>
      </div>
    </div>
  )
}

// QrCode icon re-used by design payment selectors that render a QR thumbnail.
export { QrCode }
