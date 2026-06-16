'use client'

/**
 * Modern Two-Column checkout design — Shopify / Amazon inspired.
 *
 * Pure presentation: all logic lives in useCheckout(). This composes the
 * branding-aware primitives (OrderTypeSelector, AdvanceOrderScheduler,
 * CheckoutFields, OrderSummaryLines, PaymentMethodList, CheckoutCTA) into a
 * polished, responsive layout with its own header + page background.
 *
 * The page shell renders the confirmation screen, payment-details dialog, QR
 * dialog, cart remove-dialog and upsell modal — this component never does.
 */

import { ArrowLeft, Lock, ShoppingBag, User, CreditCard } from 'lucide-react'
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

export function ModernCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    router, tenant, branding, orderTypes, orderType, formFields, advanceConfig,
  } = checkout

  if (!tenant) return null

  const accent = branding.buttonPrimary || branding.primary || '#111111'
  const accentSoft = setAlpha(accent, 0.1)

  const sectionCard =
    'rounded-2xl bg-white border border-gray-200/80 shadow-sm shadow-gray-200/40 p-5 sm:p-6 md:p-7'

  const numberBadge = (icon: React.ReactNode) => (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: accentSoft, color: accent }}
    >
      {icon}
    </span>
  )

  const showOrderType = orderTypes.length > 0
  const showCustomerInfo = !!orderType && formFields.length > 0

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-none truncate">Checkout</h1>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{tenant.name}</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Lock className="h-3.5 w-3.5" />
            Secure checkout
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 lg:items-start">
            {/* LEFT: form sections */}
            <div className="space-y-6 lg:col-span-2">
              {/* Order type + advance scheduling */}
              {showOrderType && (
                <section className={sectionCard}>
                  <div className="mb-4 sm:mb-5 flex items-start gap-3">
                    {numberBadge(<ShoppingBag className="h-5 w-5" />)}
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                        How would you like to receive your order?
                      </h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Choose a fulfillment method{advanceConfig.enabled ? ' and when you want it' : ''}.
                      </p>
                    </div>
                  </div>

                  <OrderTypeSelector checkout={checkout} />

                  {advanceConfig.enabled && (
                    <div className="mt-5 border-t border-gray-100 pt-5">
                      <AdvanceOrderScheduler checkout={checkout} />
                    </div>
                  )}
                </section>
              )}

              {/* Customer information */}
              {showCustomerInfo && (
                <section className={sectionCard}>
                  <div className="mb-5 flex items-start gap-3">
                    {numberBadge(<User className="h-5 w-5" />)}
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Your details</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Tell us where to reach you.</p>
                    </div>
                  </div>

                  <CheckoutFields checkout={checkout} columns={2} />
                </section>
              )}

              {/* Payment — kept mounted so the hook's scroll-to-error works */}
              <section className={sectionCard}>
                <div className="mb-5 flex items-start gap-3">
                  {numberBadge(<CreditCard className="h-5 w-5" />)}
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Payment</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Select how you&apos;d like to pay.</p>
                  </div>
                </div>

                <PaymentMethodList checkout={checkout} />
              </section>
            </div>

            {/* RIGHT: sticky order summary */}
            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-24">
                <div className="overflow-hidden rounded-2xl bg-white border border-gray-200/80 shadow-md shadow-gray-200/50">
                  <div
                    className="px-5 sm:px-6 py-4 border-b border-gray-100"
                    style={{ backgroundColor: setAlpha(accent, 0.05) }}
                  >
                    <h2 className="text-base sm:text-lg font-bold text-gray-900">Order summary</h2>
                  </div>

                  <div className="px-5 sm:px-6 py-5">
                    <OrderSummaryLines checkout={checkout} />

                    <div className="mt-5">
                      <CheckoutCTA checkout={checkout} />
                    </div>

                    <p className="mt-3 text-center text-xs text-gray-500">
                      Your order is sent to the restaurant for confirmation.
                    </p>

                    <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                      <Lock className="h-3 w-3" />
                      <span>Encrypted &amp; secure</span>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 hidden rounded-xl px-4 py-3 text-center text-xs font-medium lg:block"
                  style={{ backgroundColor: accentSoft }}
                >
                  <span style={{ color: accent }}>Almost there</span>
                  <span className="text-gray-500"> — review and confirm your order.</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}
