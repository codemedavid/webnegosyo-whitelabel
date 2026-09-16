'use client'

/**
 * useCartView — the shared cart-page logic layer.
 *
 * ALL cart-page behaviour lives here so the visual cart designs are pure
 * presentation. Crucially, the checkout-upsell interstitial orchestration
 * (prefetch + show-modal-or-navigate) lives here, so every design preserves
 * upsell conversions automatically — designs just call `requestCheckout()`.
 */

import { useParams } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding } from '@/lib/branding-utils'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { toast } from 'sonner'
import { useCartCommands } from '@/storefront/cart/use-cart-commands'
import { useCartCheckout } from '@/storefront/cart/use-cart-checkout'
import type { Tenant } from '@/types/database'

export function useCartView() {
  const params = useParams()
  const tenantSlug = params.tenant as string
  const cart = useCart()
  const { items, bundleItems, total, updateQuantity, removeItem, removeBundleFromCart, updateBundleQuantity } = cart

  const [fetchedTenant, setTenant] = useState<Tenant | null>(null)
  // Branding Studio live preview — merges the editor's unsaved draft over the
  // saved tenant when the cart page renders inside the preview iframe.
  const tenant = useBrandingPreviewTenant(fetchedTenant)
  const [isLoading, setIsLoading] = useState(true)
  const commands = useCartCommands({ tenantId: tenant?.id, cart })
  const checkout = useCartCheckout({ tenant, tenantSlug, items,
    hasItems: items.length + bundleItems.length > 0, enabled: true })
  const { router } = checkout
  const branding = useMemo(() => getTenantBranding(tenant), [tenant])

  // Load tenant data from Supabase
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setTenant(null)
    const loadTenant = async () => {
      try {
        const { data, error } = await getTenantBySlugClient(tenantSlug)
        if (cancelled) return
        if (error || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)
      } catch {
        if (cancelled) return
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadTenant()
    return () => { cancelled = true }
  }, [tenantSlug, router])

  // Reliable in-cart "exit": always return to the menu. Using router.back()
  // exits the whole browser when the cart is the entry point (e.g. opened from
  // a Messenger link with no in-app history).
  const exitToMenu = useCallback(() => {
    router.push(`/${tenantSlug}/menu`)
  }, [router, tenantSlug])

  return {
    // identity
    tenantSlug,
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
    ...commands,
    exitToMenu,
    ...checkout,
  }
}

export type UseCartViewReturn = ReturnType<typeof useCartView>
