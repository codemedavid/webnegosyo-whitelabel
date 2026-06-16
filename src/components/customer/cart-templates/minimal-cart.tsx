'use client'

/**
 * Minimal cart design — an Apple/Stripe-style, calm and airy single-column
 * layout wired to the shared useCartView() hook. Centered max-w-xl on a neutral
 * page, with a minimal header (back button + large "Cart" heading), generously
 * spaced line items, hairline dividers, totals, and a full-width pill CTA.
 *
 * Pure presentation — all logic lives in useCartView(). The remove dialog and
 * the upsell interstitial are rendered by the page shell (shared).
 */

import { ArrowLeft } from 'lucide-react'
import { setAlpha } from '@/lib/branding-utils'
import {
  CartItemRow,
  CartBundleRow,
  CartTotalsRows,
  CartCheckoutButton,
  CartContinueShopping,
  CartEmptyState,
} from './cart-primitives'
import type { UseCartViewReturn } from '@/hooks/useCartView'

export function MinimalCart({ cart }: { cart: UseCartViewReturn }) {
  const { tenant, items, bundleItems, router } = cart

  if (!tenant) return null

  const accent = cart.branding.buttonPrimary || cart.branding.primary || '#111111'
  const accentSoft = setAlpha(accent, 0.08)

  const isEmpty = items.length === 0 && bundleItems.length === 0
  const bundles = bundleItems.filter((bi) => Array.isArray(bi.slots))
  const itemCount = items.length + bundles.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-xl items-center gap-3 px-5 md:px-0">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-semibold tracking-tight text-gray-900">Cart</span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-24 pt-8 md:px-0 md:pt-12">
        {isEmpty ? (
          <CartEmptyState cart={cart} />
        ) : (
          <>
            {/* Large bold heading */}
            <div className="mb-8 md:mb-10">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">Cart</h1>
              {itemCount > 0 && (
                <p className="mt-1.5 text-sm text-gray-500">
                  {itemCount} item{itemCount !== 1 ? 's' : ''} in your bag
                </p>
              )}
            </div>

            {/* Line items + bundles, generous spacing */}
            <div className="space-y-4 md:space-y-5">
              {items.map((item, index) => (
                <CartItemRow key={item.id} cart={cart} item={item} index={index} />
              ))}
              {bundles.map((bundleItem) => (
                <CartBundleRow key={bundleItem.id} cart={cart} bundleItem={bundleItem} />
              ))}
            </div>

            {/* Summary panel */}
            <section
              className="mt-10 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-8"
              style={{ boxShadow: `0 1px 2px ${accentSoft}` }}
            >
              <CartTotalsRows cart={cart} />
            </section>

            {/* Actions: full-width pill CTA + continue shopping */}
            <div className="mt-7 space-y-3">
              <CartCheckoutButton cart={cart} className="!rounded-full" />
              <CartContinueShopping cart={cart} />
            </div>

            {/* Calm reassurance line */}
            <p className="mt-6 text-center text-xs font-medium text-gray-400">
              You can review your order before paying.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
