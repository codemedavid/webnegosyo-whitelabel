'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getCheckoutUpsellsAction } from '@/app/actions/menu-engineering'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'
import type { CartItem, MenuItem, Tenant } from '@/types/database'

type CartCheckoutOptions = {
  tenant: Tenant | null | undefined
  tenantSlug: string
  tenantId?: string
  items: CartItem[]
  hasItems: boolean
  /** Prefetch only while this surface is active (open drawer or mounted page). */
  enabled: boolean
  menuEngineeringEnabled?: boolean
  checkoutUpsellEnabled?: boolean
  checkoutUpsellMaxItems?: number
  onCheckoutStart?: () => void
}

/** Shared checkout policy and interstitial flow for every cart presentation. */
export function useCartCheckout({
  tenant, tenantSlug, tenantId = tenant?.id, items, hasItems, enabled,
  menuEngineeringEnabled = tenant?.menu_engineering_enabled,
  checkoutUpsellEnabled = tenant?.checkout_upsell_enabled,
  checkoutUpsellMaxItems = tenant?.checkout_upsell_max_items || 4,
  onCheckoutStart,
}: CartCheckoutOptions) {
  const router = useRouter()
  const openStatus = useStoreOpenStatus(tenant)
  const [isNavigating, setIsNavigating] = useState(false)
  const [showUpsellModal, setShowUpsellModal] = useState(false)
  const [prefetch, setPrefetch] = useState<{ key: string; items: MenuItem[] } | null>(null)
  const navigationRef = useRef(false)
  const navigationVersion = useRef(0)
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showInterstitial = !!(tenantId && menuEngineeringEnabled && checkoutUpsellEnabled)
  const cartSignature = useMemo(() => [...new Set(items.map((item) => item.menu_item.id))].sort().join(','), [items])

  const prefetchKey = JSON.stringify([tenantId, tenantSlug, cartSignature, checkoutUpsellMaxItems, showInterstitial])
  const prefetchedItems = prefetch?.key === prefetchKey ? prefetch.items : null

  useEffect(() => {
    if (!enabled || !hasItems) return
    router.prefetch(`/${tenantSlug}/checkout`)
  }, [enabled, hasItems, router, tenantSlug])

  useEffect(() => {
    if (!enabled || !showInterstitial || !tenantId || !cartSignature) return
    let cancelled = false
    const timer = setTimeout(() => {
      getCheckoutUpsellsAction(cartSignature.split(','), tenantId, checkoutUpsellMaxItems)
        .then((result) => {
          if (!cancelled && result.success && result.data) setPrefetch({ key: prefetchKey, items: result.data })
        })
        .catch(() => { /* The modal can retry on demand. */ })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled, showInterstitial, tenantId, cartSignature, checkoutUpsellMaxItems, prefetchKey])

  useEffect(() => {
    setIsNavigating(false)
    setShowUpsellModal(false)
    return () => {
      navigationVersion.current += 1
      navigationRef.current = false
      if (navigationTimer.current !== null) clearTimeout(navigationTimer.current)
      navigationTimer.current = null
    }
  }, [tenantId, tenantSlug])

  const canCheckout = useCallback(() => {
    if (openStatus.isOrderingBlocked) {
      toast.error(openStatus.nextOpenLabel
        ? `${STORE_CLOSED_MESSAGE}. Opens ${openStatus.nextOpenLabel}.`
        : `${STORE_CLOSED_MESSAGE}.`)
      return false
    }
    return hasItems
  }, [openStatus.isOrderingBlocked, openStatus.nextOpenLabel, hasItems])

  const navigateToCheckout = useCallback(async () => {
    if (navigationRef.current || !canCheckout()) return
    navigationRef.current = true
    setIsNavigating(true)
    const version = ++navigationVersion.current
    const timer = setTimeout(() => {
      if (version !== navigationVersion.current) return
      navigationRef.current = false
      setIsNavigating(false)
    }, 5000)
    navigationTimer.current = timer
    try {
      onCheckoutStart?.()
      await router.push(`/${tenantSlug}/checkout`)
    } catch {
      if (version === navigationVersion.current) toast.error('Failed to navigate to checkout')
    } finally {
      clearTimeout(timer)
      if (version === navigationVersion.current) {
        navigationTimer.current = null
        navigationRef.current = false
        setIsNavigating(false)
      }
    }
  }, [canCheckout, onCheckoutStart, router, tenantSlug])

  const requestCheckout = useCallback(() => {
    if (!canCheckout()) return
    if (showInterstitial) {
      onCheckoutStart?.()
      setShowUpsellModal(true)
      return
    }
    void navigateToCheckout()
  }, [canCheckout, showInterstitial, onCheckoutStart, navigateToCheckout])

  const onUpsellContinue = useCallback(() => {
    setShowUpsellModal(false)
    void navigateToCheckout()
  }, [navigateToCheckout])

  return { router, openStatus, isNavigating, showInterstitial, showUpsellModal, setShowUpsellModal,
    prefetchedItems, requestCheckout, navigateToCheckout, onUpsellContinue }
}
