'use client'

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Check, ArrowRight } from 'lucide-react'
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
  /** Prefetched items from cart page — skip server fetch */
  prefetchedItems?: MenuItem[]
  /** Preview mode for admin — skip analytics */
  previewSuggestions?: MenuItem[]
  /** Preview mode colors */
  previewColors?: CheckoutModalColors
  /** Override z-index class */
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
    transition: { type: 'spring' as const, damping: 30, stiffness: 300 },
  },
  exit: {
    y: '100%',
    transition: { duration: 0.2 },
  },
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 24, stiffness: 280 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 },
  },
}

const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 20, stiffness: 260 },
  },
}

const shimmerStyle = {
  background: 'linear-gradient(90deg, hsl(0 0% 90%) 25%, hsl(0 0% 97%) 50%, hsl(0 0% 90%) 75%)',
  backgroundSize: '200% 100%',
}

const shimmerAnim = { backgroundPosition: ['200% 0', '-200% 0'] }
const shimmerTransition = { duration: 1.4, repeat: Infinity, ease: 'linear' as const }

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-gray-100">
      <motion.div
        className="aspect-[4/3] w-full"
        style={shimmerStyle}
        animate={shimmerAnim}
        transition={shimmerTransition}
      />
      <div className="p-3 space-y-2">
        <motion.div
          className="h-4 w-3/4 rounded-lg"
          style={shimmerStyle}
          animate={shimmerAnim}
          transition={{ ...shimmerTransition, delay: 0.1 }}
        />
        <motion.div
          className="h-3.5 w-1/2 rounded-lg"
          style={shimmerStyle}
          animate={shimmerAnim}
          transition={{ ...shimmerTransition, delay: 0.15 }}
        />
        <motion.div
          className="h-9 w-full rounded-xl mt-1"
          style={shimmerStyle}
          animate={shimmerAnim}
          transition={{ ...shimmerTransition, delay: 0.2 }}
        />
      </div>
    </div>
  )
}

const UpsellItemCard = memo(function UpsellItemCard({
  item,
  onAdd,
  colors,
  eagerImage = false,
}: {
  item: MenuItem
  onAdd: () => void
  colors: CheckoutModalColors
  eagerImage?: boolean
}) {
  const [isAdded, setIsAdded] = useState(false)
  const addResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  const handleAdd = () => {
    if (isAdded) return
    onAdd()
    setIsAdded(true)

    if (addResetTimeoutRef.current) {
      clearTimeout(addResetTimeoutRef.current)
    }

    addResetTimeoutRef.current = setTimeout(() => {
      setIsAdded(false)
      addResetTimeoutRef.current = null
    }, 1200)
  }

  useEffect(() => {
    return () => {
      if (addResetTimeoutRef.current) {
        clearTimeout(addResetTimeoutRef.current)
        addResetTimeoutRef.current = null
      }
    }
  }, [])

  return (
    <motion.div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        border: `1.5px solid ${colors.border}`,
        boxShadow: '0 2px 8px 0 rgb(0 0 0 / 0.06), 0 1px 2px 0 rgb(0 0 0 / 0.04)',
        backgroundColor: colors.background,
      }}
      variants={cardVariants}
      whileHover={{ y: -2, boxShadow: '0 8px 24px 0 rgb(0 0 0 / 0.10), 0 2px 4px 0 rgb(0 0 0 / 0.06)' }}
      transition={{ type: 'spring' as const, damping: 20, stiffness: 300 }}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-300 hover:scale-105"
            sizes="(max-width: 640px) 44vw, 180px"
            lazy={!eagerImage}
            fetchPriority={eagerImage ? 'high' : 'auto'}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center"
            style={{ backgroundColor: `color-mix(in srgb, ${colors.button} 8%, transparent)` }}
          >
            <ShoppingBag className="h-10 w-10 opacity-20" style={{ color: colors.button }} />
          </div>
        )}

        {/* Sale badge */}
        {hasDiscount && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center rounded-lg bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              Sale
            </span>
          </div>
        )}

        {/* Added overlay */}
        <AnimatePresence>
          {isAdded && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: `color-mix(in srgb, ${colors.button} 92%, transparent)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring' as const, damping: 14, stiffness: 320 }}
                className="flex flex-col items-center gap-1"
                style={{ color: colors.buttonText }}
              >
                <Check className="h-8 w-8" strokeWidth={2.5} />
                <span className="text-xs font-bold">Added!</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: colors.title }}>
            {item.name}
          </p>
          {item.description && (
            <p className="text-xs mt-0.5 line-clamp-1 leading-relaxed" style={{ color: colors.description }}>
              {item.description}
            </p>
          )}
        </div>

        {/* Price + Add button */}
        <div className="space-y-2">
          <div className="flex items-baseline gap-1.5">
            {hasDiscount && (
              <span className="text-xs line-through" style={{ color: colors.description }}>
                {formatPrice(item.price)}
              </span>
            )}
            <span className="text-base font-bold" style={{ color: colors.price }}>
              {formatPrice(displayPrice)}
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="w-full h-9 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: isAdded ? `color-mix(in srgb, ${colors.button} 15%, transparent)` : colors.button,
              color: isAdded ? colors.button : colors.buttonText,
              border: isAdded ? `1.5px solid ${colors.button}` : 'none',
              transition: 'background-color 0.2s, color 0.2s',
            }}
            onClick={(e) => {
              e.stopPropagation()
              handleAdd()
            }}
          >
            {isAdded ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Added
              </>
            ) : (
              <>
                <span className="text-sm leading-none">+</span>
                Add to Cart
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
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
}: CheckoutUpsellModalProps) {
  const { items: cartItems, addItem } = useCart()
  const [suggestions, setSuggestions] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const isPreview = !!previewSuggestions
  const shownTrackedRef = useRef(false)
  const upsellAddedCountRef = useRef(0)

  useEffect(() => {
    if (!open) {
      shownTrackedRef.current = false
      upsellAddedCountRef.current = 0
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    // 1. Preview mode: use provided data directly, skip fetch + analytics
    if (previewSuggestions) {
      setSuggestions(previewSuggestions)
      setIsLoading(false)
      return
    }

    // 2. Prefetched items: use instantly, no loading state, but DO track analytics
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

    // 3. Fallback: fetch on demand (shouldn't happen normally)
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
      .catch(() => {
        // On error just show empty state, don't auto-skip
      })
      .finally(() => {
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefetchedItems, previewSuggestions])

  const colors: CheckoutModalColors = useMemo(() => previewColors ?? {
    background: branding.checkoutModalBackground,
    title: branding.checkoutModalTitle,
    description: branding.checkoutModalDescription,
    price: branding.checkoutModalPrice,
    button: branding.checkoutModalButton,
    buttonText: branding.checkoutModalButtonText,
    border: branding.checkoutModalBorder,
  }, [previewColors, branding])

  const handleAddItem = useCallback(
    (item: MenuItem) => {
      if (isPreview) return
      addItem(item, undefined, [], 1, undefined, 'checkout_modal')
      toast.success(`Added ${item.name} to cart`)
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

  const renderGrid = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: Math.min(maxItems, 4) }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )
    }

    if (suggestions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `color-mix(in srgb, ${colors.button} 10%, transparent)` }}
          >
            <ShoppingBag className="h-7 w-7" style={{ color: colors.button }} />
          </div>
          <p className="text-sm font-medium" style={{ color: colors.description }}>
            No suggestions available right now
          </p>
        </div>
      )
    }

    return (
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
            onAdd={() => handleAddItem(item)}
            colors={colors}
            eagerImage={suggestions.length <= 2 || index < 2}
          />
        ))}
      </motion.div>
    )
  }

  const footerButton = (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold"
      style={{
        height: '52px',
        backgroundColor: 'transparent',
        color: colors.description,
        border: `1.5px solid ${colors.border}`,
      }}
      onClick={onContinue}
    >
      No thanks, checkout
      <ArrowRight className="h-4 w-4" />
    </motion.button>
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay — desktop only (mobile is full-screen) */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} hidden bg-black/65 backdrop-blur-sm sm:block`}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onContinue}
          />

          {/* Mobile: Full-screen takeover */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} flex flex-col sm:hidden`}
            style={{ backgroundColor: colors.background }}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 shrink-0 border-b"
              style={{ borderColor: colors.border }}
            >
              <div>
                <p className="text-lg font-bold leading-tight" style={{ color: colors.title }}>
                  {title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: colors.description }}>
                  {subtitle}
                </p>
              </div>
              <button
                onClick={onContinue}
                className="rounded-full p-2 ml-2 shrink-0 transition-colors hover:bg-black/6"
                style={{ color: colors.description }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable grid */}
            <div className="overflow-y-auto flex-1 px-4 pt-4 pb-2">
              {renderGrid()}
            </div>

            {/* Footer */}
            <div
              className="px-4 pt-3 pb-5 shrink-0 border-t"
              style={{ backgroundColor: colors.background, borderColor: colors.border }}
            >
              {footerButton}
            </div>
          </motion.div>

          {/* Desktop: Centered modal */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} hidden items-center justify-center sm:flex p-4`}
          >
            <motion.div
              className="w-full max-w-2xl flex flex-col rounded-3xl overflow-hidden"
              style={{
                backgroundColor: colors.background,
                maxHeight: '90vh',
                boxShadow: '0 32px 64px -12px rgb(0 0 0 / 0.28), 0 16px 32px -8px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(0 0 0 / 0.04)',
              }}
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-5 border-b shrink-0"
                style={{ borderColor: colors.border }}
              >
                <div>
                  <p className="text-xl font-bold leading-tight" style={{ color: colors.title }}>
                    {title}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: colors.description }}>
                    {subtitle}
                  </p>
                </div>
                <button
                  onClick={onContinue}
                  className="rounded-full p-2 ml-4 shrink-0 transition-colors hover:bg-black/6"
                  style={{ color: colors.description }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable grid */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                {renderGrid()}
              </div>

              {/* Footer */}
              <div
                className="px-6 py-5 border-t shrink-0"
                style={{ borderColor: colors.border }}
              >
                {footerButton}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})
