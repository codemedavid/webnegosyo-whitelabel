'use client'

/**
 * Shared, design-agnostic cart pieces.
 *
 * The remove-confirmation dialog is rendered by the cart page shell for ALL
 * cart designs; `CartOffers` is the one line every design places between its
 * items and its totals, so every design carries the cart's "last call".
 */

import dynamic from 'next/dynamic'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import { cartOfferThemeFromBranding } from '@/components/customer/offers/offer-theme'
import { cartColorVars, getCartColors } from './cart-primitives'

// Lazy-loaded — only fetched when the store has cart suggestions switched on.
const CartOffersSection = dynamic(
  () => import('@/components/customer/offers/cart-offers-section').then((m) => ({ default: m.CartOffersSection })),
  { ssr: false },
)

// Lazy-loaded — only fetched when the customer taps "Edit" on a cart line.
const ItemDetailModal = dynamic(
  () => import('@/components/customer/item-detail-modal').then((m) => ({ default: m.ItemDetailModal })),
  { ssr: false },
)

/**
 * Full-screen loading state (shared across cart designs). The store isn't
 * known yet when this renders (page hydration, design chunk loading), so it
 * paints the neutral theme tokens rather than any store colour.
 */
export function CartLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading cart...</p>
      </div>
    </div>
  )
}

/** Restaurant-not-found state (shared across cart designs). No store = no palette. */
export function CartNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Restaurant not found</p>
      </div>
    </div>
  )
}

/** Remove-item confirmation dialog (shared across cart designs). */
export function CartRemoveDialog({ cart }: { cart: UseCartViewReturn }) {
  const { itemToRemove, handleCancelRemove, handleConfirmRemove } = cart
  const c = getCartColors(cart.tenant, cart.branding)
  return (
    <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && handleCancelRemove()}>
      <AlertDialogContent className="max-w-sm rounded-2xl" style={{ ...cartColorVars(c), backgroundColor: c.card, borderColor: c.border, color: c.text }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center" style={{ color: c.text }}>Remove Item?</AlertDialogTitle>
          <AlertDialogDescription className="text-center" style={{ color: c.muted }}>
            Do you want to remove <span className="font-semibold" style={{ color: c.text }}>{itemToRemove?.menu_item.name}</span> from your cart?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
          <AlertDialogCancel
            className="flex-1 mt-0 rounded-xl bg-transparent hover:bg-[var(--cart-soft)]"
            style={{ borderColor: c.border, color: c.text }}
          >
            Keep Item
          </AlertDialogCancel>
          <AlertDialogAction
            className="flex-1 rounded-xl hover:opacity-90"
            style={{ backgroundColor: c.danger, color: c.dangerText }}
            onClick={handleConfirmRemove}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Edit-item dialog (shared across cart designs). Lets the customer change the
 * flavor/variation, add-ons, quantity, or note of a single cart line — so two
 * same-product lines with different flavors can each be corrected independently.
 */
export function CartEditDialog({ cart }: { cart: UseCartViewReturn }) {
  const { itemToEdit, setItemToEdit, handleUpdateItem, branding } = cart
  if (!itemToEdit) return null
  return (
    <ItemDetailModal
      item={itemToEdit.menu_item}
      editItem={itemToEdit}
      open={!!itemToEdit}
      onClose={() => setItemToEdit(null)}
      onAddToCart={(menuItem, variation, addons, quantity, specialInstructions) =>
        handleUpdateItem(itemToEdit.id, menuItem, variation, addons, quantity, specialInstructions)
      }
      branding={branding}
    />
  )
}

/**
 * The cart's "last call" — Boost Sales suggestions shown inline, between the
 * items and the totals, in the merchant's own cart colours.
 */
export function CartOffers({ cart, className = 'mt-6' }: { cart: UseCartViewReturn; className?: string }) {
  const { showCartOffers, tenant, tenantSlug, branding, items, cartOfferItems, cartOfferMaxItems } = cart
  if (!showCartOffers || !tenant) return null
  return (
    <div className={className}>
      <CartOffersSection
        suggestions={cartOfferItems}
        cartItemIds={items.map((line) => line.menu_item.id)}
        maxItems={cartOfferMaxItems}
        title={tenant.checkout_upsell_title?.trim() || 'Add to your order'}
        subtitle={tenant.checkout_upsell_subtitle?.trim() || undefined}
        theme={cartOfferThemeFromBranding(branding)}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        hideCurrencySymbol={tenant.hide_currency_symbol}
      />
    </div>
  )
}
