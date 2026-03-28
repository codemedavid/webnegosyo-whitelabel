'use client'

import { memo, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface UpsellItemCardProps {
  item: MenuItem
  onAdd: (item: MenuItem) => void
  hideCurrencySymbol?: boolean
  index: number
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'tween', duration: 0.15 } },
}

export const UpsellItemCard = memo(function UpsellItemCard({
  item,
  onAdd,
  hideCurrencySymbol,
  index,
}: UpsellItemCardProps) {
  const [isAdded, setIsAdded] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAdd = useCallback(() => {
    if (isAdded) return
    onAdd(item)
    setIsAdded(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsAdded(false), 1200)
  }, [item, onAdd, isAdded])

  const displayPrice = item.discounted_price ?? item.price

  return (
    <motion.button
      variants={cardVariants}
      onClick={handleAdd}
      className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 text-left transition-shadow hover:shadow-md"
      type="button"
      aria-label={isAdded ? `${item.name} added` : `Add ${item.name}`}
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
              transition={{ type: 'spring', damping: 15, stiffness: 300 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500"
            >
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </motion.div>
            <span className="mt-1.5 text-xs font-semibold text-white">Added!</span>
          </motion.div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium text-gray-900">
          {item.name}
        </span>
        <span className="text-sm font-semibold text-gray-700">
          {formatPrice(displayPrice, { hideCurrencySymbol })}
        </span>
      </div>
    </motion.button>
  )
})
