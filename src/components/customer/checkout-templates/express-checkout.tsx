'use client'

/**
 * Express checkout design — "Express Mobile Sheet" (DoorDash / Uber Eats feel).
 *
 * Mobile-first, condensed single column in a max-w-lg container. Each section is a
 * compact rounded-2xl card. A sticky bottom pay bar pins the total + CTA to the
 * viewport bottom so checkout stays one thumb-tap away.
 *
 * Pure presentation: all logic comes from useCheckout() and the branding-aware
 * primitives. The confirmation screen, payment-details / QR dialogs are rendered
 * by the page shell, not here. PaymentMethodList + AdvanceOrderScheduler stay
 * mounted in the normal flow so the hook's scroll-to-error anchors work.
 */

import { ArrowLeft } from 'lucide-react'
import { getCheckoutPalette, setAlpha } from '@/lib/branding-utils'
import { formatPrice } from '@/lib/cart-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import {
  OrderTypeSelector,
  AdvanceOrderScheduler,
  CheckoutFields,
  OrderSummaryLines,
  PaymentMethodList,
  CheckoutCTA,
} from './checkout-primitives'

function Section({
  title,
  subtitle,
  children,
  surfaceColor,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  surfaceColor?: string
}) {
  return (
    <section
      className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5"
      style={{ backgroundColor: surfaceColor }}
    >
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function ExpressCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const { router, tenant, orderTypes, orderType, formFields, advanceConfig } = checkout

  if (!tenant) return null

  const palette = getCheckoutPalette(checkout.tenant, checkout.branding)
  const accent = palette.accent

  return (
    <div className="min-h-screen bg-gray-50" style={{ backgroundColor: palette.background }}>
      {/* Compact sticky header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
          <span className="ml-auto truncate text-sm text-gray-400">{tenant.name}</span>
        </div>
      </header>

      {/* Scroll content — extra bottom padding so the pay bar never overlaps */}
      <main className="mx-auto max-w-lg px-4 pt-4 pb-32">
        <div className="space-y-4">
          {/* Order type + scheduling */}
          {orderTypes.length > 0 && (
            <Section
              title="How do you want it?"
              subtitle={advanceConfig.enabled ? 'Pick a method and when' : 'Pick a fulfillment method'}
              surfaceColor={palette.cardBackground}
            >
              <OrderTypeSelector checkout={checkout} compact />
              {advanceConfig.enabled && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <AdvanceOrderScheduler checkout={checkout} />
                </div>
              )}
            </Section>
          )}

          {/* Customer information */}
          {orderType && formFields.length > 0 && (
            <Section title="Your details" subtitle="So we can prepare your order" surfaceColor={palette.cardBackground}>
              <CheckoutFields checkout={checkout} columns={1} />
            </Section>
          )}

          {/* Payment methods — stays mounted for scroll-to-error anchor */}
          <Section title="Payment" subtitle="Choose how you'd like to pay" surfaceColor={palette.cardBackground}>
            <PaymentMethodList checkout={checkout} />
          </Section>

          {/* Order summary */}
          <Section title="Order summary" subtitle="Review before you confirm" surfaceColor={palette.summaryBackground ?? palette.cardBackground}>
            <OrderSummaryLines checkout={checkout} />
          </Section>

          <p className="px-1 text-center text-xs text-gray-400">
            Your order is sent to the restaurant for confirmation.
          </p>
        </div>
      </main>

      {/* Sticky bottom pay bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white"
        style={{
          boxShadow: `0 -8px 24px -12px ${setAlpha('#000000', 0.18)}`,
          backgroundColor: palette.summaryBackground,
          borderTopColor: palette.border,
        }}
      >
        <div
          className="mx-auto max-w-lg px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-gray-500">Total</span>
            <span className="text-xl font-bold" style={{ color: accent }}>
              {checkout.isFetchingDeliveryFee ? (
                <span className="animate-pulse">Calculating...</span>
              ) : (
                formatPrice(checkout.grandTotal)
              )}
            </span>
          </div>
          <CheckoutCTA checkout={checkout} />
        </div>
      </div>
    </div>
  )
}
