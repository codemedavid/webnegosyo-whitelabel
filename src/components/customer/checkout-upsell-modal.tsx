'use client'

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import { UpsellFullScreenLayout } from '@/components/customer/upsell-full-screen-layout'
import { UpsellItemCard } from '@/components/customer/upsell-item-card'
import { useImagePreload } from '@/hooks/useImagePreload'
import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutUpsellsAction } from '@/app/actions/menu-engineering'
import { useCart } from '@/hooks/useCart'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

interface CheckoutUpsellModalProps {
  open: boolean
  onContinue: () => void
  tenantId: string
  /** Kept for backward compat with callers; not used internally */
  branding?: BrandingColors
  title: string
  subtitle: string
  maxItems: number
  prefetchedItems?: MenuItem[]
  previewSuggestions?: MenuItem[]
  /** Admin preview colors — passed from branding editor */
  previewColors?: Record<string, string>
  /** Override z-index class for layered preview modals */
  zIndexClass?: string
  hideCurrencySymbol?: boolean
}

const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
}

// Stable skeleton indices to avoid re-creating arrays on each render
const SKELETON_INDICES = [0, 1, 2, 3] as const

function SkeletonCard() {
  return (
    <div className="border border-gray-200 bg-white rounded-xl overflow-hidden">
      <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  )
}

export const CheckoutUpsellModal = memo(function CheckoutUpsellModal({
  open,
  onContinue,
  tenantId,
  title,
  subtitle,
  maxItems,
  prefetchedItems,
  previewSuggestions,
  hideCurrencySymbol,
}: CheckoutUpsellModalProps) {
  const { items: cartItems, addItem } = useCart()
  const hasPrefetched = !!(prefetchedItems && prefetchedItems.length > 0) || !!previewSuggestions
  const [suggestions, setSuggestions] = useState<MenuItem[]>(
    previewSuggestions ?? (prefetchedItems && prefetchedItems.length > 0 ? prefetchedItems : [])
  )
  const [isLoading, setIsLoading] = useState(!hasPrefetched)

  const isPreview = !!previewSuggestions
  const shownTrackedRef = useRef(false)
  const upsellAddedCountRef = useRef(0)
  const initialSuggestionsCountRef = useRef(suggestions.length)

  // Preload suggestion images via <link rel="preload"> for instant rendering
  const imageUrls = useMemo(
    () => suggestions.map((s) => s.image_url).filter(Boolean) as string[],
    [suggestions]
  )
  useImagePreload(imageUrls)

  // Compute live cart total
  const liveCartTotal = useMemo(
    () => cartItems.reduce((sum, ci) => sum + (ci.menu_item.discounted_price ?? ci.menu_item.price) * ci.quantity, 0),
    [cartItems]
  )

  // Track initial suggestion count when modal opens; reset refs on close
  useEffect(() => {
    if (open) {
      initialSuggestionsCountRef.current = suggestions.length
    } else {
      shownTrackedRef.current = false
      upsellAddedCountRef.current = 0
    }
    // Only respond to open/close transitions, not suggestion count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return

    if (previewSuggestions) {
      setSuggestions(previewSuggestions)
      setIsLoading(false)
      return
    }

    if (prefetchedItems && prefetchedItems.length > 0) {
      setSuggestions(prefetchedItems)
      setIsLoading(false)
      if (!shownTrackedRef.current) {
        shownTrackedRef.current = true
        trackAnalyticsEventAction(tenantId, 'upsell_shown', {
          source: 'checkout_modal',
          itemCount: prefetchedItems.length,
        })
      }
      return
    }

    // On-demand fetch as fallback when no prefetched items available
    let cancelled = false
    setIsLoading(true)
    const cartItemIds = cartItems.map((ci) => ci.menu_item.id)
    getCheckoutUpsellsAction(cartItemIds, tenantId, maxItems)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data) {
          setSuggestions(result.data)
          if (result.data.length > 0 && !shownTrackedRef.current) {
            shownTrackedRef.current = true
            trackAnalyticsEventAction(tenantId, 'upsell_shown', {
              source: 'checkout_modal',
              itemCount: result.data.length,
            })
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefetchedItems, previewSuggestions])

  const handleAddItem = useCallback(
    (item: MenuItem, quantity: number) => {
      if (isPreview) return
      addItem(item, undefined, [], quantity, undefined, 'checkout_modal')
      upsellAddedCountRef.current += 1
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'checkout_modal',
        itemId: item.id,
        itemName: item.name,
        price: item.price,
      })
      // Remove item from suggestions after checkmark animation (1200ms)
      setTimeout(() => {
        setSuggestions((prev) => prev.filter((s) => s.id !== item.id))
      }, 1200)
    },
    [addItem, isPreview, tenantId]
  )

  const handleDismiss = useCallback(() => {
    if (!isPreview) {
      trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
        source: 'checkout_modal',
        suggestionsShown: initialSuggestionsCountRef.current,
        itemsAdded: upsellAddedCountRef.current,
      })
    }
    onContinue()
  }, [isPreview, tenantId, onContinue])

  const footerContent = (
    <div className="space-y-3">
      {/* Cart total */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Cart total</span>
        <span className="font-semibold text-gray-900">
          {formatPrice(liveCartTotal, { hideCurrencySymbol })}
        </span>
      </div>

      {/* Primary CTA */}
      <button
        onClick={handleDismiss}
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        type="button"
      >
        Continue to Checkout
      </button>

      {/* Ghost link */}
      <button
        onClick={handleDismiss}
        className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
        type="button"
      >
        No thanks, checkout
      </button>
    </div>
  )

  return (
    <UpsellFullScreenLayout
      open={open}
      onClose={handleDismiss}
      title={title}
      subtitle={subtitle}
      footer={footerContent}
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SKELETON_INDICES.slice(0, Math.min(maxItems, 4)).map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ShoppingBag className="h-14 w-14 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No suggestions right now</p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          variants={gridVariants}
          initial="hidden"
          animate="visible"
        >
          {suggestions.map((item, index) => (
            <UpsellItemCard
              key={item.id}
              item={item}
              onAdd={handleAddItem}
              hideCurrencySymbol={hideCurrencySymbol}
              index={index}
            />
          ))}
        </motion.div>
      )}
    </UpsellFullScreenLayout>
  )
})
