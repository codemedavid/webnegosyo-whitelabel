'use client'

/**
 * Branding-aware cart building blocks.
 *
 * The modern cart designs compose these instead of re-implementing quantity
 * controls, bundle rendering, savings math, and totals. Each primitive themes
 * itself from the resolved cart palette (getCartColors).
 *
 * getCartPalette inherits every field from the store's brand when the merchant
 * left a cart_* colour blank, so EVERY visible colour here comes from the
 * palette (or the brand's success/error colours) — no hard-coded light greys,
 * whites or oranges, which used to clash with dark-themed stores. Hover tints
 * can't be inline styles, so the palette is also exposed as `--cart-*` CSS
 * variables (cartColorVars) read by `hover:bg-[var(--cart-soft)]`-style classes.
 */

import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { addonLabel } from '@/lib/addon-quantity'
import Link from 'next/link'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Minus, Plus, Trash2, Pencil, ShoppingBag, Package } from 'lucide-react'
import { formatPrice, calculateSlotBundleSavings, calculateTotalSlotBundleSavings } from '@/lib/cart-utils'
import { formatPresellDateLabel } from '@/lib/presell/month-grid'
import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { getCartPalette, getContrastColor, setAlpha, DEFAULT_BRANDING, type BrandingColors } from '@/lib/branding-utils'
import { useSeniorMode } from '@/components/customer/senior-mode/senior-mode-provider'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import type { CartItem, CartBundleItem } from '@/types/database'

/** Every colour a cart surface paints with — all resolved, none optional. */
export interface CartColors {
  background: string
  card: string
  summary: string
  text: string
  muted: string
  border: string
  accent: string
  accentText: string
  accentSoft: string
  accentBorder: string
  button: string
  buttonText: string
  danger: string
  dangerText: string
  dangerSoft: string
  success: string
  successSoft: string
}

const SOFT_ALPHA = 0.1

/**
 * Resolve the cart palette into concrete colours. getCartPalette already
 * inherits blank cart_* fields from the brand; the `??` fallbacks only satisfy
 * the optional SurfacePalette type and mirror the same brand sources.
 */
export function getCartColors(
  tenant: Record<string, unknown> | null | undefined,
  branding: BrandingColors,
): CartColors {
  const p = getCartPalette(tenant, branding)
  const danger = branding.error || DEFAULT_BRANDING.error
  const success = branding.success || DEFAULT_BRANDING.success
  return {
    background: p.background ?? branding.background,
    card: p.cardBackground ?? branding.cards,
    summary: p.summaryBackground ?? p.cardBackground ?? branding.cards,
    text: p.text ?? branding.textPrimary,
    muted: p.mutedText ?? branding.textSecondary,
    border: p.border ?? branding.border,
    accent: p.accent,
    accentText: p.accentText,
    accentSoft: p.accentSoft,
    accentBorder: p.accentBorder,
    button: p.button ?? p.accent,
    buttonText: p.accentText,
    danger,
    dangerText: getContrastColor(danger),
    dangerSoft: setAlpha(danger, SOFT_ALPHA),
    success,
    successSoft: setAlpha(success, SOFT_ALPHA),
  }
}

/** The palette as CSS variables, so hover/focus classes can use it too. */
export function cartColorVars(c: CartColors): CSSProperties {
  return {
    '--cart-text': c.text,
    '--cart-muted': c.muted,
    '--cart-border': c.border,
    '--cart-card': c.card,
    '--cart-accent': c.accent,
    '--cart-soft': c.accentSoft,
    '--cart-accent-border': c.accentBorder,
    '--cart-danger': c.danger,
    '--cart-danger-soft': c.dangerSoft,
  } as CSSProperties
}

function useCartColors(cart: UseCartViewReturn): CartColors {
  return getCartColors(cart.tenant, cart.branding)
}

/** Palette-aware empty state (the shared EmptyState paints shadcn tokens). */
export function CartEmptyPanel({
  colors: c,
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  colors: CartColors
  icon: LucideIcon
  title: ReactNode
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
      style={{ borderColor: c.border }}
    >
      <div className="mb-4 rounded-full p-4" style={{ backgroundColor: c.accentSoft }}>
        <Icon className="h-10 w-10" style={{ color: c.accent }} />
      </div>
      <h3 className="mb-2 text-lg font-semibold" style={{ color: c.text }}>{title}</h3>
      <p className="mb-6 text-sm" style={{ color: c.muted }}>{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: c.button, color: c.buttonText }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/** A single cart line item with image, variations, addons, quantity stepper. */
export function CartItemRow({ cart, item, index }: { cart: UseCartViewReturn; item: CartItem; index: number }) {
  const { updateQuantity, setItemToRemove, setItemToEdit, handleDecreaseQuantity, canIncreaseItem, presellHintFor } = cart
  const p = useCartColors(cart)
  // Senior mode enlarges the page, so a long dish name gets a second line
  // instead of being cut to "Skinles…".
  const isSeniorMode = useSeniorMode()
  const mi = item.menu_item
  const canIncrease = canIncreaseItem(item)
  const presellHint = presellHintFor(item)
  const canEdit =
    (mi.variation_types?.length ?? 0) > 0 || mi.variations.length > 0 || mi.addons.length > 0

  return (
    <div
      data-branding-scope="cart/item"
      className="group rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow border"
      style={{ ...cartColorVars(p), backgroundColor: p.card, borderColor: p.border }}
    >
      <div className="flex gap-4">
        <div className="relative h-20 w-20 md:h-24 md:w-24 flex-shrink-0 overflow-hidden rounded-xl" style={{ backgroundColor: p.accentSoft }}>
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
              <h3 className={`text-base md:text-lg font-bold ${isSeniorMode ? 'line-clamp-2' : 'line-clamp-1'}`} style={{ color: p.text }}>{item.menu_item.name}</h3>
              <div className="flex items-center -mt-1 -mr-1 flex-shrink-0">
                {canEdit && (
                  <button
                    className="h-9 w-9 inline-flex items-center justify-center hover:bg-[var(--cart-soft)] rounded-full touch-manipulation transition-colors"
                    style={{ color: p.muted }}
                    onClick={() => setItemToEdit(item)}
                    aria-label="Edit item"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  className="h-9 w-9 inline-flex items-center justify-center hover:bg-[var(--cart-danger-soft)] rounded-full touch-manipulation transition-colors"
                  style={{ color: p.danger }}
                  onClick={() => setItemToRemove(item)}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              </div>
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
              <p className="text-sm mt-1" style={{ color: p.muted }}><span className="font-medium">Add-ons:</span> {item.selected_addons.map(addonLabel).join(', ')}</p>
            )}
            {item.special_instructions && (
              <p className="text-sm italic mt-0.5" style={{ color: p.muted }}><span className="font-medium">Note:</span> {item.special_instructions}</p>
            )}
            {item.presell_date && (
              <p className="text-sm mt-0.5" style={{ color: p.accent }}>
                <span className="font-medium">Pre-order for:</span> {formatPresellDateLabel(item.presell_date)}
                {presellHint && <span className="ml-2 text-xs" style={{ color: p.muted }}>{presellHint}</span>}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-3">
            <div className="flex items-center gap-2.5">
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-full border hover:bg-[var(--cart-soft)] touch-manipulation transition-colors"
                style={{ borderColor: p.border, color: p.text }}
                onClick={() => handleDecreaseQuantity(item)}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-9 text-center font-bold text-lg" style={{ color: p.text }}>{item.quantity}</span>
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-full border hover:bg-[var(--cart-soft)] touch-manipulation transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: p.accentBorder, color: p.accent }}
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                disabled={!canIncrease}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="ml-auto text-right">
              <span data-branding-scope="cart/item-price" className="text-lg font-bold" style={{ color: p.accent }}>{formatPrice(item.subtotal)}</span>
              {item.quantity > 1 && (
                <p className="text-xs" style={{ color: p.muted }}>{formatPrice(item.subtotal / item.quantity)} each</p>
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
  const p = useCartColors(cart)
  if (!Array.isArray(bundleItem.slots)) return null

  const savings = calculateSlotBundleSavings(bundleItem)
  const originalTotal = bundleItem.slots.reduce((sum, s) => sum + s.menuItemPrice * s.quantity, 0)

  return (
    <div data-branding-scope="cart/item" className="rounded-2xl p-4 md:p-5 shadow-sm border" style={{ ...cartColorVars(p), backgroundColor: p.card, borderColor: p.border }}>
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4" style={{ color: p.accent }} />
        <span className="font-bold" style={{ color: p.text }}>{bundleItem.bundleName}</span>
        {savings > 0 && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: p.successSoft, color: p.success }}>
            Save {formatPrice(savings)}
          </span>
        )}
      </div>

      <div className="space-y-2 mb-3 pl-6 border-l-2" style={{ borderColor: p.accentSoft }}>
        {bundleItem.slots.map((slot, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-medium" style={{ color: p.text }}>
              {slot.quantity > 1 ? `${slot.quantity}x ` : ''}{slot.menuItemName}
            </span>
            {slot.selectedVariations && Object.values(slot.selectedVariations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {Object.values(slot.selectedVariations).map((opt, i) => (
                  <span key={i} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: p.accentSoft, color: p.muted }}>{opt.name}</span>
                ))}
              </div>
            )}
            {slot.selectedVariation && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs mt-0.5" style={{ backgroundColor: p.accentSoft, color: p.muted }}>{slot.selectedVariation.name}</span>
            )}
            {slot.selectedAddons.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: p.muted }}>+ {slot.selectedAddons.map(addonLabel).join(', ')}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full px-2 py-1" style={{ backgroundColor: p.accentSoft, color: p.text }}>
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity - 1)} className="p-1 rounded-full hover:bg-[var(--cart-soft)] transition-colors" aria-label="Decrease quantity">
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm font-semibold w-6 text-center">{bundleItem.quantity}</span>
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)} className="p-1 rounded-full hover:bg-[var(--cart-soft)] transition-colors" aria-label="Increase quantity">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button onClick={() => removeBundleFromCart(bundleItem.id)} className="p-1.5 rounded-full hover:bg-[var(--cart-danger-soft)] transition-colors" style={{ color: p.danger }} aria-label="Remove bundle">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="text-right">
          {savings > 0 && (
            <span className="text-xs line-through block" style={{ color: p.muted }}>{formatPrice(originalTotal * bundleItem.quantity)}</span>
          )}
          <span data-branding-scope="cart/item-price" className="font-bold" style={{ color: p.accent }}>{formatPrice(bundleItem.subtotal)}</span>
        </div>
      </div>
    </div>
  )
}

/** Totals rows (items / bundle savings / total). Inline, no container. */
export function CartTotalsRows({ cart }: { cart: UseCartViewReturn }) {
  const { items, bundleItems, total } = cart
  const p = useCartColors(cart)
  const bundleSavings = calculateTotalSlotBundleSavings(bundleItems)

  return (
    <div data-branding-scope="cart/summary" className="space-y-3">
      <div className="flex justify-between items-center">
        <span style={{ color: p.muted }}>Items ({items.length})</span>
        <span className="font-semibold" style={{ color: p.text }}>{formatPrice(total)}</span>
      </div>
      {bundleSavings > 0 && (
        <div className="flex justify-between items-center text-sm" style={{ color: p.success }}>
          <span>Bundle savings</span>
          <span>-{formatPrice(bundleSavings)}</span>
        </div>
      )}
      <div className="border-t pt-3" style={{ borderColor: p.border }}>
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold" style={{ color: p.text }}><StoreLabel name="cart.total" fallback="Total" /></span>
          <span className="text-2xl font-bold" style={{ color: p.accent }}>{formatPrice(total)}</span>
        </div>
      </div>
    </div>
  )
}

/** Primary checkout CTA button (branded). Drives the upsell-aware requestCheckout(). */
export function CartCheckoutButton({ cart, className = '' }: { cart: UseCartViewReturn; className?: string }) {
  const { isNavigating, requestCheckout } = cart
  const p = useCartColors(cart)
  return (
    <button
      data-branding-scope="cart/checkout-button"
      type="button"
      onClick={requestCheckout}
      disabled={isNavigating}
      className={`w-full min-w-0 min-h-14 px-4 py-2 inline-flex items-center justify-center text-center leading-tight font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ backgroundColor: p.button, color: p.buttonText }}
    >
      {isNavigating ? (
        <>
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-lg">Loading...</span>
        </>
      ) : (
        <span className="text-lg"><StoreLabel name="cart.checkout" fallback="Proceed to Checkout" /></span>
      )}
    </button>
  )
}

/** "Continue shopping" secondary link (branded outline). */
export function CartContinueShopping({ cart }: { cart: UseCartViewReturn }) {
  const { tenantSlug } = cart
  const p = useCartColors(cart)
  return (
    <Link href={`/${tenantSlug}/menu`} className="w-full">
      <span
        className="flex items-center justify-center w-full h-12 border-2 hover:bg-[var(--cart-soft)] rounded-2xl font-semibold transition-colors"
        style={{ ...cartColorVars(p), borderColor: p.border, color: p.text }}
      >
        Continue Shopping
      </span>
    </Link>
  )
}

/** Empty-cart state (branded). */
export function CartEmptyState({ cart }: { cart: UseCartViewReturn }) {
  const { router, tenantSlug } = cart
  const p = useCartColors(cart)
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-3xl p-12 sm:p-16 shadow-lg text-center max-w-md" style={{ backgroundColor: p.card }}>
        <CartEmptyPanel
          colors={p}
          icon={ShoppingBag}
          title={<StoreLabel name="cart.empty" fallback="Your cart is empty" />}
          description="Add some items from the menu to get started"
          actionLabel="Browse Menu"
          onAction={() => router.push(`/${tenantSlug}/menu`)}
        />
      </div>
    </div>
  )
}
