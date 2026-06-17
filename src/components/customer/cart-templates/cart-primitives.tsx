'use client'

/**
 * Branding-aware cart building blocks.
 *
 * The modern cart designs compose these instead of re-implementing quantity
 * controls, bundle rendering, savings math, and totals. Each primitive themes
 * itself from the resolved cart palette (getCartPalette). The Classic design
 * preserves the original orange markup verbatim and does not use these.
 *
 * Palette fields other than the accent are EXPLICIT overrides (undefined unless
 * the merchant set that cart_* color), so they no-op into the design's own
 * neutral defaults until chosen — no visual regression for existing tenants.
 */

import Link from 'next/link'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Minus, Plus, Trash2, ShoppingBag, Package } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { formatPrice, calculateSlotBundleSavings, calculateTotalSlotBundleSavings } from '@/lib/cart-utils'
import { getCartPalette } from '@/lib/branding-utils'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import type { CartItem, CartBundleItem } from '@/types/database'

function useCartPalette(cart: UseCartViewReturn) {
  return getCartPalette(cart.tenant, cart.branding)
}

/** A single cart line item with image, variations, addons, quantity stepper. */
export function CartItemRow({ cart, item, index }: { cart: UseCartViewReturn; item: CartItem; index: number }) {
  const { updateQuantity, setItemToRemove, handleDecreaseQuantity } = cart
  const p = useCartPalette(cart)

  return (
    <div
      className="group rounded-2xl bg-white p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
      style={{ backgroundColor: p.cardBackground, borderColor: p.border }}
    >
      <div className="flex gap-4">
        <div className="relative h-20 w-20 md:h-24 md:w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
          <OptimizedImage
            src={item.menu_item.image_url}
            alt={item.menu_item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="96px"
            lazy={index > 5}
            fetchPriority={index === 0 ? 'high' : 'auto'}
          />
        </div>

        <div className="flex flex-1 flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="text-base md:text-lg font-bold text-gray-900 line-clamp-1" style={{ color: p.text }}>{item.menu_item.name}</h3>
              <button
                className="h-9 w-9 -mt-1 -mr-1 inline-flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full touch-manipulation transition-colors"
                onClick={() => setItemToRemove(item)}
                aria-label="Remove item"
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            </div>

            {item.selected_variation && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: p.accentSoft, color: p.accent }}>
                {item.selected_variation.name}
              </span>
            )}
            {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.values(item.selected_variations).map((option, idx) => (
                  <span key={idx} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: p.accentSoft, color: p.accent }}>
                    {option.name}
                  </span>
                ))}
              </div>
            )}
            {item.selected_addons.length > 0 && (
              <p className="text-sm text-gray-600 mt-1" style={{ color: p.mutedText }}><span className="font-medium">Add-ons:</span> {item.selected_addons.map((a) => a.name).join(', ')}</p>
            )}
            {item.special_instructions && (
              <p className="text-sm italic text-gray-500 mt-0.5" style={{ color: p.mutedText }}><span className="font-medium">Note:</span> {item.special_instructions}</p>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2.5">
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 touch-manipulation transition-colors"
                style={{ borderColor: p.border }}
                onClick={() => handleDecreaseQuantity(item)}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-9 text-center font-bold text-lg text-gray-900" style={{ color: p.text }}>{item.quantity}</span>
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-full border touch-manipulation transition-colors"
                style={{ borderColor: p.accentSoft, color: p.accent }}
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold" style={{ color: p.accent }}>{formatPrice(item.subtotal)}</span>
              {item.quantity > 1 && (
                <p className="text-xs text-gray-500" style={{ color: p.mutedText }}>{formatPrice(item.subtotal / item.quantity)} each</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A bundle line item with its slots, savings badge, and quantity stepper. */
export function CartBundleRow({ cart, bundleItem }: { cart: UseCartViewReturn; bundleItem: CartBundleItem }) {
  const { removeBundleFromCart, updateBundleQuantity } = cart
  const p = useCartPalette(cart)
  if (!Array.isArray(bundleItem.slots)) return null

  const savings = calculateSlotBundleSavings(bundleItem)
  const originalTotal = bundleItem.slots.reduce((sum, s) => sum + s.menuItemPrice * s.quantity, 0)

  return (
    <div className="rounded-2xl bg-white p-4 md:p-5 shadow-sm border" style={{ backgroundColor: p.cardBackground, borderColor: p.border ?? p.accentSoft }}>
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4" style={{ color: p.accent }} />
        <span className="font-bold text-gray-900" style={{ color: p.text }}>{bundleItem.bundleName}</span>
        {savings > 0 && (
          <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
            Save {formatPrice(savings)}
          </span>
        )}
      </div>

      <div className="space-y-2 mb-3 pl-6 border-l-2" style={{ borderColor: p.accentSoft }}>
        {bundleItem.slots.map((slot, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-medium text-gray-800" style={{ color: p.text }}>
              {slot.quantity > 1 ? `${slot.quantity}x ` : ''}{slot.menuItemName}
            </span>
            {slot.selectedVariations && Object.values(slot.selectedVariations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {Object.values(slot.selectedVariations).map((opt, i) => (
                  <span key={i} className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{opt.name}</span>
                ))}
              </div>
            )}
            {slot.selectedVariation && (
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 mt-0.5">{slot.selectedVariation.name}</span>
            )}
            {slot.selectedAddons.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5" style={{ color: p.mutedText }}>+ {slot.selectedAddons.map(a => a.name).join(', ')}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-full px-2 py-1">
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity - 1)} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm font-semibold w-6 text-center">{bundleItem.quantity}</span>
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button onClick={() => removeBundleFromCart(bundleItem.id)} className="p-1.5 rounded-full text-red-400 hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="text-right">
          {savings > 0 && (
            <span className="text-xs text-gray-400 line-through block">{formatPrice(originalTotal * bundleItem.quantity)}</span>
          )}
          <span className="font-bold" style={{ color: p.accent }}>{formatPrice(bundleItem.subtotal)}</span>
        </div>
      </div>
    </div>
  )
}

/** Totals rows (items / bundle savings / total). Inline, no container. */
export function CartTotalsRows({ cart }: { cart: UseCartViewReturn }) {
  const { items, bundleItems, total } = cart
  const p = useCartPalette(cart)
  const bundleSavings = calculateTotalSlotBundleSavings(bundleItems)

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-gray-600" style={{ color: p.mutedText }}>Items ({items.length})</span>
        <span className="font-semibold text-gray-900" style={{ color: p.text }}>{formatPrice(total)}</span>
      </div>
      {bundleSavings > 0 && (
        <div className="flex justify-between items-center text-green-600 text-sm">
          <span>Bundle savings</span>
          <span>-{formatPrice(bundleSavings)}</span>
        </div>
      )}
      <div className="border-t border-gray-200 pt-3" style={{ borderColor: p.border }}>
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900" style={{ color: p.text }}>Total</span>
          <span className="text-2xl font-bold" style={{ color: p.accent }}>{formatPrice(total)}</span>
        </div>
      </div>
    </div>
  )
}

/** Primary checkout CTA button (branded). Drives the upsell-aware requestCheckout(). */
export function CartCheckoutButton({ cart, className = '' }: { cart: UseCartViewReturn; className?: string }) {
  const { isNavigating, requestCheckout } = cart
  const p = useCartPalette(cart)
  return (
    <button
      type="button"
      onClick={requestCheckout}
      disabled={isNavigating}
      className={`w-full h-14 inline-flex items-center justify-center font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ backgroundColor: p.button ?? p.accent, color: p.accentText }}
    >
      {isNavigating ? (
        <>
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-lg">Loading...</span>
        </>
      ) : (
        <span className="text-lg">Proceed to Checkout</span>
      )}
    </button>
  )
}

/** "Continue shopping" secondary link (branded outline). */
export function CartContinueShopping({ cart }: { cart: UseCartViewReturn }) {
  const { tenantSlug } = cart
  return (
    <Link href={`/${tenantSlug}/menu`} className="w-full">
      <span className="flex items-center justify-center w-full h-12 border-2 border-gray-200 hover:bg-gray-50 rounded-2xl font-semibold text-gray-700 transition-colors">
        Continue Shopping
      </span>
    </Link>
  )
}

/** Empty-cart state (branded). */
export function CartEmptyState({ cart }: { cart: UseCartViewReturn }) {
  const { router, tenantSlug } = cart
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-3xl bg-white p-12 sm:p-16 shadow-lg text-center max-w-md">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add some items from the menu to get started"
          actionLabel="Browse Menu"
          onAction={() => router.push(`/${tenantSlug}/menu`)}
        />
      </div>
    </div>
  )
}
