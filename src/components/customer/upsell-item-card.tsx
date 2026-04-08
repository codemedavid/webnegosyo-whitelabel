'use client'

import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface UpsellItemCardProps {
  item: MenuItem
  onAdd: (item: MenuItem, quantity: number) => void
  hideCurrencySymbol?: boolean
  index: number
  tenantSlug?: string
}

function itemNeedsCustomization(item: MenuItem): boolean {
  const hasVariations = (item.variations?.length ?? 0) > 0
  const hasVariationTypes = (item.variation_types?.length ?? 0) > 0
  const hasAddons = (item.addons?.length ?? 0) > 0
  return hasVariations || hasVariationTypes || hasAddons
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'tween' as const, duration: 0.15 } },
}

export const UpsellItemCard = memo(function UpsellItemCard({
  item,
  onAdd,
  hideCurrencySymbol,
  index,
  tenantSlug,
}: UpsellItemCardProps) {
  const router = useRouter()
  const [isAdded, setIsAdded] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const needsCustomization = itemNeedsCustomization(item)

  // Clean up timeout on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isAdded) return
    onAdd(item, quantity)
    setIsAdded(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsAdded(false)
      setQuantity(1)
    }, 1200)
  }, [item, onAdd, isAdded, quantity])

  const handleCardClick = useCallback(() => {
    if (needsCustomization && tenantSlug) {
      router.push(`/${tenantSlug}/menu/item/${item.id}`)
    }
  }, [needsCustomization, tenantSlug, router, item.id])

  const handleDecrement = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setQuantity(q => Math.max(1, q - 1))
  }, [])

  const handleIncrement = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setQuantity(q => Math.min(10, q + 1))
  }, [])

  const displayPrice = item.discounted_price ?? item.price

  return (
    <motion.div
      variants={cardVariants}
      onClick={needsCustomization ? handleCardClick : undefined}
      className={`flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 text-left transition-shadow hover:shadow-md ${
        needsCustomization ? 'cursor-pointer' : ''
      }`}
      role={needsCustomization ? 'link' : undefined}
      aria-label={needsCustomization ? `Customize ${item.name}` : undefined}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
            loading={index < 4 ? 'eager' : 'lazy'}
            fetchPriority={index < 2 ? 'high' : 'auto'}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            No image
          </div>
        )}

        {/* Added overlay */}
        {isAdded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' as const, damping: 15, stiffness: 300 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500"
            >
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </motion.div>
            <span className="mt-1.5 text-xs font-semibold text-white">Added!</span>
          </motion.div>
        )}

        {/* Customization badge */}
        {needsCustomization && (
          <div className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            Has options
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-sm font-medium text-gray-900">
          {item.name}
        </span>
        <span className="text-sm font-semibold text-gray-700">
          {formatPrice(displayPrice, { hideCurrencySymbol })}
        </span>

        {/* Quantity selector + Add button (for items without customization) */}
        {!needsCustomization && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={handleDecrement}
                className="flex h-7 w-7 items-center justify-center text-gray-500 transition-colors hover:text-gray-900"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-[1.5rem] text-center text-xs font-semibold text-gray-900">
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                className="flex h-7 w-7 items-center justify-center text-gray-500 transition-colors hover:text-gray-900"
                aria-label="Increase quantity"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdded}
              className="flex-1 rounded-lg bg-gray-900 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              {isAdded ? 'Added!' : 'Add'}
            </button>
          </div>
        )}

        {/* "View options" button for items with customization */}
        {needsCustomization && (
          <button
            type="button"
            onClick={handleCardClick}
            className="mt-1.5 w-full rounded-lg border border-gray-900 py-1.5 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
          >
            Customize & Add
          </button>
        )}
      </div>
    </motion.div>
  )
})
