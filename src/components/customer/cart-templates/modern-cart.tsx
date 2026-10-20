'use client'

/**
 * Modern cart design — a Shopify-style two-column layout wired to the shared
 * useCartView() hook. Palette surfaces with a sticky header and an elevated,
 * sticky order-summary card. Every colour derives from the cart palette. The remove dialog and upsell interstitial are rendered by the page
 * shell (shared) — this component is pure presentation.
 */

import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import {
  CartItemRow,
  CartBundleRow,
  CartTotalsRows,
  CartCheckoutButton,
  CartContinueShopping,
  CartEmptyState,
  cartColorVars,
  getCartColors,
} from './cart-primitives'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import { CartOffers } from './cart-shared'

export function ModernCart({ cart }: { cart: UseCartViewReturn }) {
  if (!cart.tenant) return null

  const palette = getCartColors(cart.tenant, cart.branding)
  const accent = palette.accent
  const accentText = palette.accentText
  const accentSoft = palette.accentSoft

  const { items, bundleItems } = cart
  const bundles = bundleItems.filter((bi) => Array.isArray(bi.slots))
  const itemCount = items.length + bundles.length
  const isEmpty = items.length === 0 && bundleItems.length === 0

  return (
    <div className="min-h-screen" style={{ ...cartColorVars(palette), backgroundColor: palette.background }}>
      {/* Sticky header */}
      <header data-senior-hidden className="sticky top-0 z-50 border-b backdrop-blur-sm" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
        <div className="container mx-auto flex h-16 items-center gap-3 px-4 md:h-20">
          <button
            type="button"
            onClick={cart.exitToMenu}
            aria-label="Go back"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--cart-soft)]"
            style={{ color: palette.text }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-3">
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: palette.text }}><StoreLabel name="cart.title" fallback="Your Cart" /></h1>
            {!isEmpty && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: accentSoft, color: accent }}
              >
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-8">
        {isEmpty ? (
          <CartEmptyState cart={cart} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            {/* LEFT: line items + bundles */}
            <div className="space-y-4 lg:col-span-2">
              {items.map((item, index) => (
                <CartItemRow key={item.id} cart={cart} item={item} index={index} />
              ))}
              {bundles.map((bundleItem) => (
                <CartBundleRow key={bundleItem.id} cart={cart} bundleItem={bundleItem} />
              ))}
            </div>
            <CartOffers cart={cart} />

            {/* RIGHT: sticky order summary */}
            <div className="lg:col-span-1">
              <div
                className="sticky top-24 rounded-2xl border p-6 shadow-lg md:p-8"
                style={{ backgroundColor: palette.summary, borderColor: palette.border }}
              >
                <div className="mb-6 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: accent, color: accentText }}
                  >
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold" style={{ color: palette.text }}>Order summary</h2>
                </div>

                <div className="mb-6">
                  <CartTotalsRows cart={cart} />
                </div>

                <div className="space-y-3">
                  <CartCheckoutButton cart={cart} />
                  <CartContinueShopping cart={cart} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
