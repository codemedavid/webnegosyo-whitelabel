'use client'

import { useState, memo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem } from '@/types/database'

interface UpsellSuggestionModalProps {
  open: boolean
  onClose: () => void
  onAddItem: (item: MenuItem) => void
  suggestions: MenuItem[]
  triggerItemName: string
  tenantId?: string
  sourceItemId?: string
  /** Override z-index class for preview mode (renders above sidebar) */
  zIndexClass?: string
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const sheetVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring' as const, damping: 28, stiffness: 400 },
  },
  exit: {
    y: '100%',
    transition: { duration: 0.2 },
  },
}

const desktopVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 16,
    transition: { duration: 0.15 },
  },
}

const listContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03, delayChildren: 0 },
  },
}

const listItemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'tween' as const, duration: 0.15 },
  },
}

function SuggestionCard({
  item,
  onAdd,
}: {
  item: MenuItem
  onAdd: () => void
}) {
  const [isAdded, setIsAdded] = useState(false)
  const addResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  useEffect(() => {
    return () => {
      if (addResetTimeoutRef.current) {
        clearTimeout(addResetTimeoutRef.current)
      }
    }
  }, [])

  const handleAdd = useCallback(() => {
    if (isAdded) return
    onAdd()
    setIsAdded(true)
    if (addResetTimeoutRef.current) {
      clearTimeout(addResetTimeoutRef.current)
    }
    addResetTimeoutRef.current = setTimeout(() => {
      setIsAdded(false)
      addResetTimeoutRef.current = null
    }, 900)
  }, [isAdded, onAdd])

  return (
    <motion.div
      className="flex items-center gap-4 rounded-2xl border p-4"
      style={{
        borderColor: 'var(--pd-popup-border)',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
      }}
      variants={listItemVariants}
    >
      {item.image_url && (
        <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl shadow-sm">
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="76px"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--pd-popup-title)' }}>
          {item.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {hasDiscount && (
            <>
              <span className="text-xs line-through" style={{ color: 'var(--pd-popup-description)' }}>
                {formatPrice(item.price)}
              </span>
              <span className="inline-flex items-center rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                Sale
              </span>
            </>
          )}
          <span className="text-base font-bold" style={{ color: 'var(--pd-popup-price)' }}>
            {formatPrice(displayPrice)}
          </span>
        </div>
      </div>
      <div className="relative shrink-0 h-9 w-16">
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-full transition-all duration-150 ${isAdded ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
          style={{ backgroundColor: 'var(--pd-popup-button)', color: 'var(--pd-popup-button-text)' }}
        >
          <Check className="h-4 w-4" />
        </div>
        <button
          className={`absolute inset-0 flex items-center justify-center rounded-full text-xs font-semibold transition-all duration-150 hover:scale-105 active:scale-95 ${isAdded ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}
          style={{
            backgroundColor: 'var(--pd-popup-button)',
            color: 'var(--pd-popup-button-text)',
          }}
          onClick={(e) => {
            e.stopPropagation()
            handleAdd()
          }}
        >
          + Add
        </button>
      </div>
    </motion.div>
  )
}

function HeaderIcon() {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10"
      style={{ backgroundColor: 'color-mix(in srgb, var(--pd-popup-button) 12%, transparent)' }}
    >
      <Check className="h-4.5 w-4.5 sm:h-5 sm:w-5" style={{ color: 'var(--pd-popup-button)' }} />
    </div>
  )
}

export const UpsellSuggestionModal = memo(function UpsellSuggestionModal({
  open,
  onClose,
  onAddItem,
  suggestions,
  triggerItemName,
  tenantId,
  sourceItemId,
  zIndexClass = 'z-50',
}: UpsellSuggestionModalProps) {
  const shownTrackedRef = useRef(false)

  useEffect(() => {
    if (open && tenantId && suggestions.length > 0 && !shownTrackedRef.current) {
      shownTrackedRef.current = true
      trackAnalyticsEventAction(tenantId, 'upsell_shown', {
        source: 'suggestion',
        itemCount: suggestions.length,
        sourceItemId,
      })
    }
    if (!open) {
      shownTrackedRef.current = false
    }
  }, [open, tenantId, suggestions.length, sourceItemId])

  const addedCountRef = useRef(0)

  useEffect(() => {
    if (!open) {
      addedCountRef.current = 0
    }
  }, [open])

  const handleAddWithTracking = (item: MenuItem) => {
    if (tenantId) {
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'suggestion',
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        sourceItemId,
      })
    }
    addedCountRef.current += 1
    onAddItem(item)
  }

  const handleDismiss = useCallback(() => {
    if (tenantId) {
      trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
        source: 'suggestion',
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
          {/* Overlay */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-sm`}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={handleDismiss}
          />

          {/* Mobile: Bottom sheet */}
          <motion.div
            className={`fixed inset-x-0 bottom-0 ${zIndexClass} max-h-[80vh] overflow-y-auto rounded-t-2xl sm:hidden`}
            style={{ backgroundColor: 'var(--pd-popup-bg)' }}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-8 rounded-full bg-black/15" />
            </div>

            <div
              className="sticky top-0 flex items-center justify-between border-b px-4 pb-3"
              style={{ backgroundColor: 'var(--pd-popup-bg)', borderColor: 'var(--pd-popup-border)' }}
            >
              <div className="flex items-center gap-2.5">
                <HeaderIcon />
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--pd-popup-title)' }}>
                    Great choice!
                  </p>
                  <p className="text-xs" style={{ color: 'var(--pd-popup-description)' }}>
                    Goes well with {triggerItemName}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="rounded-full p-2 transition-colors hover:bg-black/5"
                style={{ color: 'var(--pd-popup-description)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <motion.div
                className="space-y-3"
                variants={listContainerVariants}
                initial="hidden"
                animate="visible"
              >
                {suggestions.map((item) => (
                  <SuggestionCard key={item.id} item={item} onAdd={() => handleAddWithTracking(item)} />
                ))}
              </motion.div>
            </div>
            <div
              className="sticky bottom-0 border-t p-4"
              style={{ backgroundColor: 'var(--pd-popup-bg)', borderColor: 'var(--pd-popup-border)' }}
            >
              <button
                className="w-full rounded-xl py-2.5 text-sm transition-opacity hover:opacity-70"
                style={{ color: 'var(--pd-popup-description)' }}
                onClick={handleDismiss}
              >
                No thanks, continue shopping
              </button>
            </div>
          </motion.div>

          {/* Desktop: Centered modal */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} hidden items-center justify-center sm:flex`}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl"
              style={{
                backgroundColor: 'var(--pd-popup-bg)',
                boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25), 0 12px 24px -8px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.03)',
              }}
              variants={desktopVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b p-5" style={{ borderColor: 'var(--pd-popup-border)' }}>
                <div className="flex items-center gap-3">
                  <HeaderIcon />
                  <div>
                    <p className="text-lg font-bold" style={{ color: 'var(--pd-popup-title)' }}>
                      Great choice!
                    </p>
                    <p className="text-sm" style={{ color: 'var(--pd-popup-description)' }}>
                      Goes well with {triggerItemName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="rounded-full p-2 transition-colors hover:bg-black/5"
                  style={{ color: 'var(--pd-popup-description)' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-5">
                <motion.div
                  className="space-y-3"
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {suggestions.map((item) => (
                    <SuggestionCard key={item.id} item={item} onAdd={() => handleAddWithTracking(item)} />
                  ))}
                </motion.div>
              </div>
              <div className="border-t p-5" style={{ borderColor: 'var(--pd-popup-border)' }}>
                <button
                  className="w-full rounded-xl py-2.5 text-sm transition-opacity hover:opacity-70"
                  style={{ color: 'var(--pd-popup-description)' }}
                  onClick={handleDismiss}
                >
                  No thanks, continue shopping
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})
