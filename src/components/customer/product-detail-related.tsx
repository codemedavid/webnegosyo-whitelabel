'use client'

import { memo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { UtensilsCrossed } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { motion } from 'framer-motion'
import type { MenuItem } from '@/types/database'

// Memoized Related Item Card Component
interface RelatedItemCardProps {
    relatedItem: MenuItem
    onClick: () => void
    index: number
}

const RelatedItemCard = memo(function RelatedItemCard({
    relatedItem,
    onClick,
    index
}: RelatedItemCardProps) {
    return (
        <motion.button
            key={relatedItem.id}
            onClick={onClick}
            className="flex-shrink-0 w-32 text-left group"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.95 }}
        >
            <div
                className="relative w-32 h-32 overflow-hidden mb-2"
                style={{
                    backgroundColor: 'var(--pd-related-item-bg)',
                    borderRadius: 'var(--pd-card-radius)'
                }}
            >
                {relatedItem.image_url ? (
                    <OptimizedImage
                        src={relatedItem.image_url}
                        alt={relatedItem.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="128px"
                    />
                ) : (
                    <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--pd-related-item-bg)' }}
                    >
                        <UtensilsCrossed className="h-8 w-8" style={{ color: 'var(--pd-image-placeholder)' }} />
                    </div>
                )}
            </div>
            <h4
                className="text-sm font-semibold truncate group-hover:opacity-80 transition-colors"
                style={{ color: 'var(--pd-related-item-name)' }}
            >
                {relatedItem.name}
            </h4>
            <p
                className="text-sm font-medium"
                style={{ color: 'var(--pd-related-item-price)' }}
            >
                {relatedItem.discounted_price && relatedItem.discounted_price < relatedItem.price
                    ? formatPrice(relatedItem.discounted_price)
                    : formatPrice(relatedItem.price)
                }
            </p>
        </motion.button>
    )
})

// Related Items Section Props
interface RelatedItemsSectionProps {
    relatedItems: MenuItem[]
    tenantSlug: string
    /**
     * When provided (bottom-sheet mode), clicking a related item swaps the item
     * in-place instead of navigating to its full-page route.
     */
    onSelectItem?: (item: MenuItem) => void
}

export function RelatedItemsSection({ relatedItems, tenantSlug, onSelectItem }: RelatedItemsSectionProps) {
    const router = useRouter()

    const handleRelatedItemClick = useCallback((relatedItem: MenuItem) => {
        if (onSelectItem) {
            onSelectItem(relatedItem)
            return
        }
        router.push(`/${tenantSlug}/menu/item/${relatedItem.id}`, { scroll: true })
    }, [router, tenantSlug, onSelectItem])

    if (relatedItems.length === 0) {
        return null
    }

    return (
        <motion.div
            className="mt-8 pt-6 border-t"
            style={{ borderColor: 'var(--pd-border)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
        >
            <h3
                className="text-lg font-bold mb-4"
                style={{
                    color: 'var(--pd-related-title)',
                    fontSize: 'var(--pd-related-title-font-size)'
                }}
            >
                You might also like
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                {relatedItems.map((relatedItem, index) => (
                    <RelatedItemCard
                        key={relatedItem.id}
                        relatedItem={relatedItem}
                        onClick={() => handleRelatedItemClick(relatedItem)}
                        index={index}
                    />
                ))}
            </div>
        </motion.div>
    )
}

// Skeleton for lazy loading
export function RelatedItemsSkeleton() {
    return (
        <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4 animate-pulse" />
            <div className="flex gap-4 overflow-hidden pb-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex-shrink-0 w-32">
                        <div className="w-32 h-32 bg-gray-200 rounded-lg mb-2 animate-pulse" />
                        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 w-16 bg-gray-200 rounded mt-1 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    )
}
