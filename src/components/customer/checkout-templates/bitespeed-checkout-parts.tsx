'use client'

/**
 * BiteSpeed checkout chrome: the section card, the order lines, the empty cart
 * and the sticky place-order bar.
 *
 * Presentation only. Every value and handler comes from useCheckout(); the
 * place-order button is gated and labelled exactly like the shared CheckoutCTA
 * (same label resolver, same disabled rule), re-skinned to the pack's tokens.
 * Colors and type come from the `--bs-*` variables set on the design's root.
 */

import { useId, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ShoppingBag, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { addonLabel } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'
import { resolveCheckoutCtaLabel } from '@/lib/messenger-availability'
import { isAfterBillingPaymentEnabled } from '@/lib/after-billing-payment'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CartBundleItem, CartItem } from '@/types/database'
import { MinimumOrderNotice } from './checkout-primitives'

export const BITESPEED_CARD_SHADOW = '0 8px 24px rgba(0,0,0,.08)'

const DISPLAY_FONT = { fontFamily: 'var(--bs-font-display)' } as const

export function menuHref(tenantSlug: string) {
  return `/${tenantSlug}/menu`
}

/** Sticky top bar: back to the menu + the store's name. */
export function BiteSpeedHeader({ tenantSlug, storeName }: { tenantSlug: string; storeName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--bs-outline)] bg-[var(--bs-surface)]">
      <div className="mx-auto flex h-16 max-w-[640px] items-center gap-2 px-4">
        <Link
          href={menuHref(tenantSlug)}
          aria-label="Back to menu"
          className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--bs-text)] transition-colors hover:bg-[var(--bs-surface-low)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="truncate text-xl font-bold tracking-tight" style={DISPLAY_FONT}>
          {storeName}
        </span>
      </div>
    </header>
  )
}

interface SectionProps {
  title: string
  icon: LucideIcon
  action?: ReactNode
  children: ReactNode
}

/** A white card with a display-font heading. Labelled, so it reads as a region. */
export function BiteSpeedSection({ title, icon: Icon, action, children }: SectionProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[var(--bs-radius)] bg-[var(--bs-surface)] p-5 sm:p-6"
      style={{ boxShadow: BITESPEED_CARD_SHADOW }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bs-accent-soft)] text-[var(--bs-accent-ink)]"
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 id={headingId} className="text-lg font-bold tracking-tight" style={DISPLAY_FONT}>
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** "ADD MORE" — back to the menu to keep ordering. */
export function AddMoreLink({ tenantSlug }: { tenantSlug: string }) {
  return (
    <Link
      href={menuHref(tenantSlug)}
      className="inline-flex min-h-11 items-center px-1 text-sm font-bold uppercase tracking-wide text-[var(--bs-accent-ink)] hover:underline"
    >
      Add more
    </Link>
  )
}

function itemOptions(item: CartItem): string[] {
  const grouped = item.selected_variations
    ? Object.values(item.selected_variations).map((option) => option.name)
    : []
  const legacy = item.selected_variation ? [item.selected_variation.name] : []
  const addons = item.selected_addons.map(addonLabel)
  return [...legacy, ...grouped, ...addons]
}

function ItemThumbnail({ item }: { item: CartItem }) {
  const imageUrl = item.menu_item.image_url
  if (!imageUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[calc(var(--bs-radius)*0.75)] bg-[var(--bs-surface-low)] text-[var(--bs-text-muted)]"
      >
        <UtensilsCrossed className="h-6 w-6" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      className="h-16 w-16 shrink-0 rounded-[calc(var(--bs-radius)*0.75)] bg-[var(--bs-surface-low)] object-cover"
    />
  )
}

/** One cart line: photo, name, its options and note, quantity and line price. */
function OrderLine({ item }: { item: CartItem }) {
  const options = itemOptions(item)
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <ItemThumbnail item={item} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{item.menu_item.name}</p>
        {options.length > 0 && (
          <p className="mt-0.5 text-sm text-[var(--bs-text-muted)]">{options.join(', ')}</p>
        )}
        {item.special_instructions && (
          <p className="mt-0.5 text-sm italic text-[var(--bs-text-muted)]">Note: {item.special_instructions}</p>
        )}
        <span className="mt-1.5 inline-flex rounded-full bg-[var(--bs-surface-high)] px-2.5 py-0.5 text-xs font-bold tabular-nums">
          ×{item.quantity}
        </span>
      </div>
      <span className="shrink-0 font-bold tabular-nums text-[var(--bs-accent-ink)]">{formatPrice(item.subtotal)}</span>
    </li>
  )
}

function BundleLine({ bundle }: { bundle: CartBundleItem }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{bundle.bundleName}</p>
        <p className="mt-0.5 text-sm text-[var(--bs-text-muted)]">Bundle</p>
        <span className="mt-1.5 inline-flex rounded-full bg-[var(--bs-surface-high)] px-2.5 py-0.5 text-xs font-bold tabular-nums">
          ×{bundle.quantity}
        </span>
      </div>
      <span className="shrink-0 font-bold tabular-nums text-[var(--bs-accent-ink)]">{formatPrice(bundle.subtotal)}</span>
    </li>
  )
}

/** Every line in the cart: dishes, then bundles (a bundle-only cart is still an order). */
export function OrderLines({ items, bundleItems }: { items: CartItem[]; bundleItems: CartBundleItem[] }) {
  return (
    <ul className="divide-y divide-[var(--bs-outline)]">
      {items.map((item) => (
        <OrderLine key={item.id} item={item} />
      ))}
      {bundleItems.map((bundle) => (
        <BundleLine key={bundle.id} bundle={bundle} />
      ))}
    </ul>
  )
}

/** Nothing in the cart: say so, and send the customer back to the menu. */
export function EmptyOrder({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bs-accent-soft)] text-[var(--bs-accent-ink)]">
        <ShoppingBag className="h-8 w-8" />
      </span>
      <p className="text-lg font-bold" style={DISPLAY_FONT}>Your order is empty</p>
      <p className="mt-1 text-sm text-[var(--bs-text-muted)]">Add something tasty from the menu.</p>
      <Link
        href={menuHref(tenantSlug)}
        className="mt-5 inline-flex h-12 items-center justify-center rounded-[var(--bs-radius)] bg-[var(--bs-accent)] px-6 font-bold text-[var(--bs-on-accent)] transition-opacity hover:opacity-90"
      >
        Browse Menu
      </Link>
    </div>
  )
}

/** The same label the shared CheckoutCTA shows, so every design names the next step alike. */
function placeOrderLabel(checkout: UseCheckoutReturn): string {
  const { paymentMethods, selectedPaymentMethod, messengerEnabled, selectedOrderTypeData } = checkout
  const selectedMethod = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
  return resolveCheckoutCtaLabel({
    hasPaymentMethods: paymentMethods.length > 0,
    isMessengerEnabled: messengerEnabled,
    isAfterBillingPayment: isAfterBillingPaymentEnabled(selectedOrderTypeData),
    requiresPaymentProof: isPaymentProofRequired(selectedMethod),
    skipsPaymentDetails: isPaymentDetailsStepSkipped(selectedMethod),
  })
}

function PlaceOrderButton({ checkout }: { checkout: UseCheckoutReturn }) {
  const { isProcessing, handleProceedToPayment, orderMinimum } = checkout
  return (
    <button
      type="button"
      onClick={handleProceedToPayment}
      disabled={isProcessing || orderMinimum?.meets === false}
      className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-[var(--bs-radius)] bg-[var(--bs-accent)] px-4 text-sm leading-tight font-bold uppercase tracking-wide sm:text-base text-[var(--bs-on-accent)] transition-[opacity,transform] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.98]"
      style={DISPLAY_FONT}
    >
      {isProcessing ? (
        <>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Processing Order...
        </>
      ) : (
        <>
          {placeOrderLabel(checkout)}
          <ArrowRight className="h-5 w-5" />
        </>
      )}
    </button>
  )
}

/** Pinned to the bottom: what the customer pays, and the one button that places it. */
export function PlaceOrderBar({ checkout }: { checkout: UseCheckoutReturn }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--bs-outline)] bg-[var(--bs-surface)]"
      style={{ boxShadow: '0 -8px 24px rgba(0,0,0,.08)' }}
    >
      <div
        className="mx-auto max-w-[640px] px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <MinimumOrderNotice checkout={checkout} className="mb-2 text-center" />
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bs-text-muted)]">Total to Pay</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--bs-accent-ink)]" style={DISPLAY_FONT}>
              {checkout.isFetchingDeliveryFee ? (
                <span className="animate-pulse text-base">Calculating...</span>
              ) : (
                formatPrice(checkout.grandTotal)
              )}
            </p>
          </div>
          <PlaceOrderButton checkout={checkout} />
        </div>
      </div>
    </div>
  )
}
