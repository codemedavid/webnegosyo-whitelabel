'use client'

/**
 * useCartView — the shared cart-page logic layer.
 *
 * ALL cart-page behaviour lives here so the visual cart designs are pure
 * presentation. Crucially, the checkout-upsell interstitial orchestration
 * (prefetch + show-modal-or-navigate) lives here, so every design preserves
 * upsell conversions automatically — designs just call `requestCheckout()`.
 */

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding } from '@/lib/branding-utils'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { getCheckoutUpsellsAction } from '@/app/actions/menu-engineering'
import { toast } from 'sonner'
import type { Tenant, CartItem, MenuItem } from '@/types/database'

export function useCartView() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, bundleItems, total, updateQuantity, removeItem, removeBundleFromCart, updateBundleQuantity } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isNavigating, setIsNavigating] = useState(false)
  const navigationCompletedRef = useRef(false)
  const [itemToRemove, setItemToRemove] = useState<CartItem | null>(null)
  const [showUpsellModal, setShowUpsellModal] = useState(false)
  const [prefetchedItems, setPrefetchedItems] = useState<MenuItem[] | null>(null)

  const showInterstitial = !!(tenant?.menu_engineering_enabled && tenant?.checkout_upsell_enabled)
  const branding = useMemo(() => getTenantBranding(tenant), [tenant])
  const cartSignature = useMemo(
    () => items.map((ci) => ci.menu_item.id).sort().join(','),
    [items]
  )

  // Load tenant data from Supabase
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const { data, error } = await getTenantBySlugClient(tenantSlug)
        if (error || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)
      } catch {
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadTenant()
  }, [tenantSlug, router])

  // Prefetch upsell items whenever cart item set changes (debounced)
  useEffect(() => {
    if (!tenant || !tenant.menu_engineering_enabled || !tenant.checkout_upsell_enabled) return
    if (!cartSignature) return

    const cartItemIds = cartSignature.split(',')
    const timer = setTimeout(() => {
      getCheckoutUpsellsAction(cartItemIds, tenant.id, tenant.checkout_upsell_max_items || 4)
        .then((result) => {
          if (result.success && result.data) {
            setPrefetchedItems(result.data)
          }
        })
        .catch(() => {
          // Silent fail — modal will fallback to on-demand fetch
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [tenant, cartSignature])

  const handleDecreaseQuantity = (item: CartItem) => {
    if (item.quantity <= 1) {
      // Show confirmation dialog when trying to decrease below 1
      setItemToRemove(item)
    } else {
      updateQuantity(item.id, item.quantity - 1)
    }
  }

  const handleConfirmRemove = () => {
    if (itemToRemove) {
      removeItem(itemToRemove.id)
      setItemToRemove(null)
    }
  }

  const handleCancelRemove = () => {
    setItemToRemove(null)
  }

  const navigateToCheckout = useCallback(async () => {
    if (isNavigating) return
    setIsNavigating(true)
    navigationCompletedRef.current = false
    const safetyTimeout = setTimeout(() => {
      if (!navigationCompletedRef.current) setIsNavigating(false)
    }, 5000)
    try {
      await router.push(`/${tenantSlug}/checkout`)
      navigationCompletedRef.current = true
    } catch {
      toast.error('Failed to navigate to checkout')
      navigationCompletedRef.current = true
    } finally {
      clearTimeout(safetyTimeout)
      navigationCompletedRef.current = true
      setIsNavigating(false)
    }
  }, [isNavigating, router, tenantSlug])

  // Checkout button entry point: show the upsell interstitial if enabled,
  // otherwise navigate straight to checkout. Used by every cart design.
  const requestCheckout = useCallback(() => {
    if (showInterstitial) {
      setShowUpsellModal(true)
      return
    }
    navigateToCheckout()
  }, [showInterstitial, navigateToCheckout])

  // The interstitial's "continue" action: close it and proceed to checkout.
  const onUpsellContinue = useCallback(() => {
    setShowUpsellModal(false)
    navigateToCheckout()
  }, [navigateToCheckout])

  return {
    // identity
    tenantSlug,
    router,
    branding,
    // tenant / loading
    tenant,
    isLoading,
    // cart data + mutations
    items,
    bundleItems,
    total,
    updateQuantity,
    removeItem,
    removeBundleFromCart,
    updateBundleQuantity,
    // remove-confirmation dialog
    itemToRemove,
    setItemToRemove,
    handleDecreaseQuantity,
    handleConfirmRemove,
    handleCancelRemove,
    // checkout navigation + interstitial
    isNavigating,
    requestCheckout,
    navigateToCheckout,
    showInterstitial,
    showUpsellModal,
    setShowUpsellModal,
    prefetchedItems,
    onUpsellContinue,
  }
}

export type UseCartViewReturn = ReturnType<typeof useCartView>
