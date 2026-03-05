'use client'

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ShoppingBag } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutUpsellsAction } from '@/app/actions/menu-engineering'
import { useCart } from '@/hooks/useCart'
import { toast } from 'sonner'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

interface CheckoutModalColors {
  background: string
  title: string
  description: string
  price: string
  button: string
  buttonText: string
  border: string
}

interface CheckoutUpsellModalProps {
  open: boolean
  onContinue: () => void
  tenantId: string
  branding: BrandingColors
  title: string
  subtitle: string
  maxItems: number
  prefetchedItems?: MenuItem[]
  previewSuggestions?: MenuItem[]
  previewColors?: CheckoutModalColors
  zIndexClass?: string
  cartTotal?: number
  hideCurrencySymbol?: boolean
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

const sheetVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring' as const, damping: 28, stiffness: 350 },
  },
  exit: {
    y: '100%',
    transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' as const },
  },
}

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'tween' as const, duration: 0.15 },
  },
}

function SkeletonCard() {
  return (
    <div className="border border-gray-200 bg-white">
      <div className="aspect-square bg-gray-100 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  )
}

const ItemCard = memo(function ItemCard({
  item,
  onTap,
  hideCurrencySymbol,
  eagerImage = false,
}: {
  item: MenuItem
  onTap: () => void
  hideCurrencySymbol?: boolean
  eagerImage?: boolean
}) {
  const [isAdded, setIsAdded] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleTap = () => {
    if (isAdded) return
    onTap()
    setIsAdded(true)
    timeoutRef.current = setTimeout(() => {
      setIsAdded(false)
      timeoutRef.current = null
    }, 1200)
  }

  const displayPrice = item.discounted_price && item.discounted_price < item.price
    ? item.discounted_price
    : item.price

  return (
    <motion.button
      type="button"
      variants={cardVariants}
      onClick={handleTap}
      className="relative border border-gray-200 bg-white text-left transition-colors active:bg-gray-50"
    >
      {/* Added overlay */}
      <div
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/95 transition-all duration-150 ${isAdded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className={`transition-transform duration-150 ${isAdded ? 'scale-100' : 'scale-0'}`}>
          <Check className="h-10 w-10 text-green-500" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold text-green-600 mt-1">Added!</span>
      </div>

      {/* Image */}
      <div className="relative aspect-square bg-white p-4">
        {item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 45vw, 220px"
            lazy={!eagerImage}
            fetchPriority={eagerImage ? 'high' : 'auto'}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-gray-200" />
          </div>
        )}
      </div>

      {/* Name + Price */}
      <div className="px-3 pb-3">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
          {item.name}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatPrice(displayPrice, { hideCurrencySymbol })}
        </p>
      </div>
    </motion.button>
  )
})

export const CheckoutUpsellModal = memo(function CheckoutUpsellModal({
  open,
  onContinue,
  tenantId,
  branding,
  title,
  subtitle,
  maxItems,
  prefetchedItems,
  previewSuggestions,
  previewColors,
  zIndexClass = 'z-50',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cartTotal: _cartTotal,
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

  // Keep colors for backward compat (used by preview mode)
  const colors: CheckoutModalColors = useMemo(() => previewColors ?? {
    background: branding.checkoutModalBackground,
    title: branding.checkoutModalTitle,
    description: branding.checkoutModalDescription,
    price: branding.checkoutModalPrice,
    button: branding.checkoutModalButton,
    buttonText: branding.checkoutModalButtonText,
    border: branding.checkoutModalBorder,
  }, [previewColors, branding])

  // Use white for the kiosk aesthetic, but allow preview colors to override
  const bgColor = previewColors ? colors.background : '#ffffff'

  useEffect(() => {
    if (open) {
      initialSuggestionsCountRef.current = suggestions.length
    } else {
      shownTrackedRef.current = false
      upsellAddedCountRef.current = 0
    }
  }, [open, suggestions.length])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
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

    setIsLoading(true)
    const cartItemIds = cartItems.map((ci) => ci.menu_item.id)
    getCheckoutUpsellsAction(cartItemIds, tenantId, maxItems)
      .then((result) => {
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
      .finally(() => { setIsLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefetchedItems, previewSuggestions])

  const handleTapItem = useCallback(
    (item: MenuItem) => {
      if (isPreview) return
      addItem(item, undefined, [], 1, undefined, 'checkout_modal')
      toast.success(`Added ${item.name}`)
      upsellAddedCountRef.current += 1
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'checkout_modal',
        itemId: item.id,
        itemName: item.name,
        price: item.price,
      })
      setSuggestions((prev) => prev.filter((s) => s.id !== item.id))
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

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />

          {/* Sheet */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} flex flex-col`}
            style={{ backgroundColor: bgColor }}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Centered content wrapper */}
            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-8 py-10 sm:px-12 sm:py-14">
              <div className="w-full max-w-md">
                {/* Title + Subtitle */}
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug"
                >
                  {title}
                </motion.h1>
                {subtitle && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-gray-400 text-center mt-2 mb-8"
                  >
                    {subtitle}
                  </motion.p>
                )}
                {!subtitle && <div className="mb-8" />}

                {/* Grid */}
                {isLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: Math.min(maxItems, 4) }).map((_, i) => (
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
                    className="grid grid-cols-2 gap-4"
                    variants={gridVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {suggestions.map((item, i) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onTap={() => handleTapItem(item)}
                        hideCurrencySymbol={hideCurrencySymbol}
                        eagerImage={i < 4}
                      />
                    ))}
                  </motion.div>
                )}

                {/* "Not Today" button */}
                <div className="mt-10">
                  <button
                    onClick={handleDismiss}
                    className="w-full h-12 border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-50 hover:bg-gray-50"
                  >
                    Not Today
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})
