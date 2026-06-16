'use client'

/**
 * Shared, design-agnostic cart pieces.
 *
 * The remove-confirmation dialog and the checkout-upsell interstitial are
 * rendered by the cart page shell for ALL cart designs, so every design
 * preserves upsell conversions and the remove-confirm UX without re-wiring it.
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

// Lazy-loaded — only fetched when the checkout upsell interstitial is enabled for the tenant.
const CheckoutUpsellModal = dynamic(
  () => import('@/components/customer/checkout-upsell-modal').then((m) => ({ default: m.CheckoutUpsellModal })),
  { ssr: false },
)

/** Full-screen loading state (shared across cart designs). */
export function CartLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
      <div className="text-center">
        <div className="h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading cart...</p>
      </div>
    </div>
  )
}

/** Restaurant-not-found state (shared across cart designs). */
export function CartNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">Restaurant not found</p>
      </div>
    </div>
  )
}

/** Remove-item confirmation dialog (shared across cart designs). */
export function CartRemoveDialog({ cart }: { cart: UseCartViewReturn }) {
  const { itemToRemove, handleCancelRemove, handleConfirmRemove } = cart
  return (
    <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && handleCancelRemove()}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center">Remove Item?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Do you want to remove <span className="font-semibold text-gray-900">{itemToRemove?.menu_item.name}</span> from your cart?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
          <AlertDialogCancel className="flex-1 mt-0 rounded-xl">
            Keep Item
          </AlertDialogCancel>
          <AlertDialogAction
            className="flex-1 bg-red-500 hover:bg-red-600 rounded-xl"
            onClick={handleConfirmRemove}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Checkout-upsell interstitial (shared across cart designs). */
export function CartUpsellInterstitial({ cart }: { cart: UseCartViewReturn }) {
  const { showInterstitial, tenant, showUpsellModal, onUpsellContinue, branding, prefetchedItems } = cart
  if (!showInterstitial || !tenant) return null
  return (
    <CheckoutUpsellModal
      open={showUpsellModal}
      onContinue={onUpsellContinue}
      tenantId={tenant.id}
      branding={branding}
      title={tenant.checkout_upsell_title || 'Would you like to add...?'}
      subtitle={tenant.checkout_upsell_subtitle || 'Complete your meal!'}
      maxItems={tenant.checkout_upsell_max_items || 4}
      prefetchedItems={prefetchedItems || undefined}
    />
  )
}
