'use client'

/**
 * "Receipt" cart design — a centered, single-column layout styled like a paper
 * receipt: a torn/zig-zag top edge, monospace amounts, and a dotted-leader vibe.
 * Pure presentation wired to useCartView() via the branding-aware primitives.
 * The remove dialog and upsell interstitial are rendered by the page shell.
 */

import { ArrowLeft, Receipt } from 'lucide-react'
import { getCartPalette } from '@/lib/branding-utils'
import {
  CartItemRow,
  CartBundleRow,
  CartTotalsRows,
  CartCheckoutButton,
  CartContinueShopping,
  CartEmptyState,
} from './cart-primitives'
import type { UseCartViewReturn } from '@/hooks/useCartView'

export function WizardCart({ cart }: { cart: UseCartViewReturn }) {
  if (!cart.tenant) return null

  const palette = getCartPalette(cart.tenant, cart.branding)
  const accent = palette.accent
  const accentSoft = palette.accentSoft

  const isEmpty = cart.items.length === 0 && cart.bundleItems.length === 0
  const bundles = cart.bundleItems.filter((bi) => Array.isArray(bi.slots))
  const itemCount = cart.items.length + bundles.length

  return (
    <div className="min-h-screen bg-gray-100" style={{ backgroundColor: palette.background }}>
      {/* Page header with back button + title */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => cart.router.back()}
            aria-label="Go back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" style={{ color: accent }} />
            <h1 className="text-lg font-bold text-gray-900">Your Cart</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {isEmpty ? (
          <CartEmptyState cart={cart} />
        ) : (
          <>
            {/* The receipt card */}
            <div className="relative">
              {/* Zig-zag torn top edge */}
              <div
                className="h-3 w-full"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, #ffffff 50%, transparent 50%), linear-gradient(225deg, #ffffff 50%, transparent 50%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: 'top',
                  backgroundRepeat: 'repeat-x',
                  filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.04))',
                }}
                aria-hidden="true"
              />

              <div
                className="-mt-px rounded-b-xl bg-white px-4 pb-6 pt-5 shadow-xl sm:px-7 sm:pb-8"
                style={{ backgroundColor: palette.cardBackground }}
              >
                {/* Receipt masthead */}
                <div className="mb-5 text-center">
                  <p
                    className="text-base font-bold uppercase tracking-[0.18em] text-gray-900"
                    style={{ color: palette.text }}
                  >
                    {cart.tenant.name}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-gray-400">
                    Order Receipt
                  </p>
                  <p className="mt-3 text-xs font-mono text-gray-500">
                    {itemCount} item{itemCount !== 1 ? 's' : ''} in your cart
                  </p>
                </div>

                {/* Dashed separator */}
                <div className="border-t border-dashed border-gray-300" aria-hidden="true" />

                {/* Line items + bundles */}
                <div className="space-y-3 py-5">
                  {cart.items.map((item, index) => (
                    <CartItemRow key={item.id} cart={cart} item={item} index={index} />
                  ))}
                  {bundles.map((bundleItem) => (
                    <CartBundleRow key={bundleItem.id} cart={cart} bundleItem={bundleItem} />
                  ))}
                </div>

                {/* Dashed separator before totals */}
                <div className="border-t border-dashed border-gray-300" aria-hidden="true" />

                {/* Totals styled as a receipt total (monospace amounts) */}
                <div
                  className="mt-5 rounded-xl px-4 py-4 font-mono [&_span]:font-mono"
                  style={{ backgroundColor: accentSoft }}
                >
                  <CartTotalsRows cart={cart} />
                </div>

                {/* Receipt footer flourish */}
                <p className="mt-5 text-center text-[11px] font-mono uppercase tracking-[0.25em] text-gray-400">
                  * * * Thank you * * *
                </p>
              </div>

              {/* Zig-zag torn bottom edge */}
              <div
                className="h-3 w-full"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #ffffff 50%, transparent 50%), linear-gradient(-45deg, #ffffff 50%, transparent 50%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: 'bottom',
                  backgroundRepeat: 'repeat-x',
                  filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.04))',
                }}
                aria-hidden="true"
              />
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              <CartCheckoutButton cart={cart} />
              <CartContinueShopping cart={cart} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
