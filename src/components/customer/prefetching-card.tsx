'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CardTemplateRenderer } from './card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface PrefetchingCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  tenantSlug: string
  branding: BrandingColors
  template?: CardTemplate
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Card wrapper that prefetches the product detail route.
 * - Desktop (hover-capable): prefetches on mouse enter.
 * - Mobile (touch): prefetches via IntersectionObserver when nearing viewport.
 * Memoized to prevent re-renders from parent state changes (e.g. carousel slide).
 */
export const PrefetchingCard = memo(function PrefetchingCard({ item, onSelect, tenantSlug, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol }: PrefetchingCardProps) {
  const router = useRouter()
  const hasPrefetched = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const prefetchRoute = useCallback(() => {
    if (hasPrefetched.current) return
    router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)
    hasPrefetched.current = true
  }, [tenantSlug, item.id, router])

  // Desktop: prefetch on hover (only for hover-capable devices)
  const handleMouseEnter = useCallback(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches) return
    prefetchRoute()
  }, [prefetchRoute])

  // Mobile/touch: prefetch when card scrolls near the viewport
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only use observer for touch/non-hover devices
    if (window.matchMedia('(hover: hover)').matches) return

    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          prefetchRoute()
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [prefetchRoute])

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      style={{ contentVisibility: 'auto' }}
    >
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={onSelect}
        branding={branding}
        menuEngineeringEnabled={menuEngineeringEnabled}
        hideCurrencySymbol={hideCurrencySymbol}
      />
    </div>
  )
})
