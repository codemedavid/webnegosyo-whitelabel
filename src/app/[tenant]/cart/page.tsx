'use client'

/**
 * Cart page shell.
 *
 * All logic lives in useCartView(); the selected design renders the cart;
 * the remove-confirmation dialog and checkout-upsell interstitial are shared.
 * The design is chosen per-tenant via `cart_template` and lazy-loaded so only
 * that design's chunk ships. Unknown values fall back to 'classic'.
 */

import { useCartView } from '@/hooks/useCartView'
import { CartTemplateRenderer } from '@/components/customer/cart-templates'
import {
  CartLoading,
  CartNotFound,
  CartRemoveDialog,
  CartUpsellInterstitial,
} from '@/components/customer/cart-templates/cart-shared'
import type { CartTemplate } from '@/lib/cart-templates'

export default function CartPage() {
  const cart = useCartView()

  if (cart.isLoading) return <CartLoading />
  if (!cart.tenant) return <CartNotFound />

  const template = (cart.tenant.cart_template || 'classic') as CartTemplate

  return (
    <>
      <CartTemplateRenderer template={template} cart={cart} />
      {/* Shared overlays — rendered for every design */}
      <CartRemoveDialog cart={cart} />
      <CartUpsellInterstitial cart={cart} />
    </>
  )
}
