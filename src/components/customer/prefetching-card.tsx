'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CardTemplateRenderer } from './card-templates'
import { prefetchProductDetail } from '@/lib/product-detail-cache'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface PrefetchingCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
}

/**
 * Card wrapper that prefetches product detail page when card enters viewport
 * This makes the product detail page load instantly when clicked - no hover needed!
 */
export function PrefetchingCard({ item, onSelect, branding, template = 'classic' }: PrefetchingCardProps) {
  const params = useParams()
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const [hasPrefetched, setHasPrefetched] = useState(false)
  const tenantParam = params.tenant

  // Validate tenant param - must be a string for prefetching
  const tenantSlug = typeof tenantParam === 'string' ? tenantParam : null

  // Prefetch when card enters viewport (Intersection Observer)
  useEffect(() => {
    if (!tenantSlug || hasPrefetched || !cardRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPrefetched) {
            // Card is visible - prefetch the page!
            router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)

            // Also prefetch data to client cache
            prefetchProductDetail(tenantSlug, item.id).catch(() => {
              // Silently fail - prefetching is optional
            })

            setHasPrefetched(true)
            observer.disconnect() // Stop observing once prefetched
          }
        })
      },
      {
        rootMargin: '100px', // Start prefetching 100px before card enters viewport
        threshold: 0
      }
    )

    observer.observe(cardRef.current)

    return () => observer.disconnect()
  }, [tenantSlug, item.id, router, hasPrefetched])

  // Fallback: also prefetch on hover/touch for items that weren't in initial viewport
  const handleInteraction = useCallback(() => {
    if (!tenantSlug || hasPrefetched) return

    router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)
    prefetchProductDetail(tenantSlug, item.id).catch(() => { })
    setHasPrefetched(true)
  }, [tenantSlug, item.id, router, hasPrefetched])

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={onSelect}
        branding={branding}
      />
    </div>
  )
}
