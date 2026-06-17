'use client'

/**
 * Express cart design — a compact, DoorDash/Uber Eats-style single-column cart.
 *
 * Mobile-first centered layout with a sticky compact header and a fixed bottom
 * bar that surfaces the total and the upsell-aware checkout CTA. Composes the
 * branding-aware primitives for line items, bundles, and totals. The remove
 * dialog and upsell interstitial are rendered by the page shell (shared).
 */

import { ArrowLeft } from 'lucide-react'
import { getCartPalette, setAlpha } from '@/lib/branding-utils'
import { formatPrice } from '@/lib/cart-utils'
import {
  CartItemRow,
  CartBundleRow,
  CartTotalsRows,
  CartCheckoutButton,
  CartContinueShopping,
  CartEmptyState,
} from './cart-primitives'
import type { UseCartViewReturn } from '@/hooks/useCartView'

export function ExpressCart({ cart }: { cart: UseCartViewReturn }) {
  const { router, tenant, items, bundleItems, total } = cart

  if (!tenant) return null

  const palette = getCartPalette(cart.tenant, cart.branding)
  const accent = palette.accent
  const isEmpty = items.length === 0 && bundleItems.length === 0
  const bundles = bundleItems.filter((bi) => Array.isArray(bi.slots))
  const itemCount = items.length + bundles.length

  return (
    <div className="min-h-screen bg-gray-50" style={{ backgroundColor: palette.background }}>
      {/* Sticky compact header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-base font-bold text-gray-900" style={{ color: palette.text }}>
            Your Cart
          </h1>
          {!isEmpty && (
            <span
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold"
              style={{ backgroundColor: setAlpha(accent, 0.12), color: accent }}
            >
              {itemCount}
            </span>
          )}
        </div>
      </header>

      {isEmpty ? (
        <main className="mx-auto max-w-lg px-4 py-6">
          <CartEmptyState cart={cart} />
        </main>
      ) : (
        <>
          <main className="mx-auto max-w-lg px-4 py-4 pb-28">
            <div className="space-y-3">
              {items.map((item, index) => (
                <CartItemRow key={item.id} cart={cart} item={item} index={index} />
              ))}

              {bundles.map((bundleItem) => (
                <CartBundleRow key={bundleItem.id} cart={cart} bundleItem={bundleItem} />
              ))}
            </div>

            {/* Order summary */}
            <div
              className="mt-4 rounded-2xl bg-white p-5 shadow-sm border border-gray-100"
              style={{ backgroundColor: palette.summaryBackground, borderColor: palette.border }}
            >
              <h2
                className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500"
                style={{ color: palette.mutedText }}
              >
                Order Summary
              </h2>
              <CartTotalsRows cart={cart} />
            </div>

            <div className="mt-4">
              <CartContinueShopping cart={cart} />
            </div>
          </main>

          {/* Fixed bottom checkout bar */}
          <div
            className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
              backgroundColor: palette.cardBackground,
              borderColor: palette.border,
            }}
          >
            <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
              <div className="flex shrink-0 flex-col">
                <span className="text-xs font-medium text-gray-500" style={{ color: palette.mutedText }}>
                  Total
                </span>
                <span className="text-lg font-bold" style={{ color: accent }}>
                  {formatPrice(total)}
                </span>
              </div>
              <CartCheckoutButton cart={cart} className="flex-1" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
