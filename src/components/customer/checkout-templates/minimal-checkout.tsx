'use client'

/**
 * Minimal Single-Column checkout design — inspired by Apple / Stripe.
 *
 * Pure presentation: all logic lives in useCheckout(). This design composes the
 * branding-aware primitives (OrderTypeSelector / AdvanceOrderScheduler /
 * CheckoutFields / OrderSummaryLines / PaymentMethodList / CheckoutCTA) into a
 * calm, centered, single-column layout. Sections are separated by thin hairline
 * dividers rather than cards. Accent color comes from tenant branding — no
 * hardcoded brand colors. The confirmation screen and payment/QR dialogs are
 * rendered by the page shell.
 */

import { ArrowLeft } from 'lucide-react'
import { setAlpha } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import {
  OrderTypeSelector,
  AdvanceOrderScheduler,
  CheckoutFields,
  OrderSummaryLines,
  PaymentMethodList,
  CheckoutCTA,
} from './checkout-primitives'

export function MinimalCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    router, tenant, branding, orderTypes, orderType, formFields, advanceConfig,
  } = checkout

  if (!tenant) return null

  const pageBackground = branding.background || '#ffffff'

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageBackground }}>
      <div className="mx-auto max-w-xl px-5 sm:px-6">
        {/* Minimal header — back button + large heading, no card chrome */}
        <header className="flex items-center gap-3 pt-6 pb-2 sm:pt-8">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </header>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 pb-2">
          Checkout
        </h1>
        <p className="text-sm text-gray-500 pb-8 sm:pb-10">
          Complete your order with {tenant.name}.
        </p>

        <div className="pb-32">
          {/* Receive — order type + (optional) advance-order scheduler */}
          {orderTypes.length > 0 && (
            <section className="py-8 sm:py-10">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-1">
                How would you like it?
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Choose a fulfillment method
                {advanceConfig.enabled ? ' and when you want it' : ''}.
              </p>
              <OrderTypeSelector checkout={checkout} />
              {advanceConfig.enabled && (
                <div className="mt-6">
                  <AdvanceOrderScheduler checkout={checkout} />
                </div>
              )}
            </section>
          )}

          {/* Details — customer info inputs (single column) */}
          {orderType && formFields.length > 0 && (
            <section className="border-t border-gray-100 py-8 sm:py-10">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-1">
                Your details
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Where should we reach you?
              </p>
              <CheckoutFields checkout={checkout} columns={1} />
            </section>
          )}

          {/* Payment — always mounted so the hook can scroll to errors */}
          <section className="border-t border-gray-100 py-8 sm:py-10">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-5">
              Payment
            </h2>
            <PaymentMethodList checkout={checkout} />
          </section>

          {/* Summary — always rendered */}
          <section className="border-t border-gray-100 py-8 sm:py-10">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-5">
              Order summary
            </h2>
            <OrderSummaryLines checkout={checkout} />
          </section>
        </div>
      </div>

      {/* Bottom CTA — full-width pill anchored above a soft fade, with breathing room */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100"
        style={{ backgroundColor: setAlpha(pageBackground, 0.92) }}
      >
        <div className="mx-auto max-w-xl px-5 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CheckoutCTA checkout={checkout} />
          <p className="text-center text-xs text-gray-400 mt-3">
            Your order will be sent to the restaurant for confirmation.
          </p>
        </div>
      </div>
    </div>
  )
}
