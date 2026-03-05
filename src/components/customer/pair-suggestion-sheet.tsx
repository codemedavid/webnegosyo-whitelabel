'use client'

import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ShoppingBag } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem } from '@/types/database'

interface PairSuggestionSheetProps {
  open: boolean
  onClose: () => void
  onAddItem: (item: MenuItem) => void
  suggestions: MenuItem[]
  triggerItemName: string
  tenantId?: string
  sourceItemId?: string
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
    transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' },
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

const PairCard = memo(function PairCard({
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

  const handleTap = useCallback(() => {
    if (isAdded) return
    onTap()
    setIsAdded(true)
    timeoutRef.current = setTimeout(() => {
      setIsAdded(false)
      timeoutRef.current = null
    }, 1200)
  }, [isAdded, onTap])

  const displayPrice = item.discounted_price && item.discounted_price < item.price
    ? item.discounted_price
    : item.price

  return (
    <motion.button
      type="button"
      variants={cardVariants}
      onClick={handleTap}
      className="relative border border-gray-200 bg-white rounded-2xl overflow-hidden text-left transition-colors active:bg-gray-50"
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
      <div className="relative aspect-[4/3] bg-white p-4">
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

export const PairSuggestionSheet = memo(function PairSuggestionSheet({
  open,
  onClose,
  onAddItem,
  suggestions,
  triggerItemName,
  tenantId,
  sourceItemId,
  hideCurrencySymbol,
}: PairSuggestionSheetProps) {
  const shownTrackedRef = useRef(false)
  const addedCountRef = useRef(0)

  useEffect(() => {
    if (open && tenantId && suggestions.length > 0 && !shownTrackedRef.current) {
      shownTrackedRef.current = true
      trackAnalyticsEventAction(tenantId, 'upsell_shown', {
        source: 'pair_suggestion',
        itemCount: suggestions.length,
        sourceItemId,
      })
    }
    if (!open) {
      shownTrackedRef.current = false
      addedCountRef.current = 0
    }
  }, [open, tenantId, suggestions.length, sourceItemId])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  // Preload images for first 6 suggestions
  useEffect(() => {
    if (!open || suggestions.length === 0) return
    suggestions.slice(0, 6).forEach(item => {
      if (item.image_url) {
        const img = new window.Image()
        img.src = item.image_url
      }
    })
  }, [open, suggestions])

  const handleTapItem = useCallback(
    (item: MenuItem) => {
      if (tenantId) {
        trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
          source: 'pair_suggestion',
          itemId: item.id,
          itemName: item.name,
          price: item.price,
          sourceItemId,
        })
      }
      addedCountRef.current += 1
      onAddItem(item)
    },
    [tenantId, sourceItemId, onAddItem]
  )

  const handleDismiss = useCallback(() => {
    if (tenantId) {
      trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
        source: 'pair_suggestion',
        suggestionsShown: suggestions.length,
        itemsAdded: addedCountRef.current,
        sourceItemId,
      })
    }
    onClose()
  }, [tenantId, suggestions.length, sourceItemId, onClose])

  if (suggestions.length === 0) return null

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
            className="fixed inset-0 z-50 flex flex-col bg-white"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Centered content wrapper */}
            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-8 py-10 sm:px-12 sm:py-14">
              <div className="w-full max-w-2xl">
                {/* Title + Subtitle */}
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug"
                >
                  Perfect with {triggerItemName}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-gray-400 text-center mt-2 mb-8"
                >
                  Complete your meal
                </motion.p>

                {/* Grid */}
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                  variants={gridVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {suggestions.map((item, i) => (
                    <PairCard
                      key={item.id}
                      item={item}
                      onTap={() => handleTapItem(item)}
                      hideCurrencySymbol={hideCurrencySymbol}
                      eagerImage={i < 4}
                    />
                  ))}
                </motion.div>

                {/* Continue button */}
                <div className="mt-10">
                  <button
                    onClick={handleDismiss}
                    className="w-full h-12 border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-50 hover:bg-gray-50"
                  >
                    Continue
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
