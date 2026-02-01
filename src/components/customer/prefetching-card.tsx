'use client'

import { useCallback } from 'react'
import { useParams } from 'next/navigation'
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
 * Card wrapper that prefetches product detail data on hover
 * This makes the product detail page load instantly when clicked
 */
export function PrefetchingCard({ item, onSelect, branding, template = 'classic' }: PrefetchingCardProps) {
  const params = useParams()
  const tenantParam = params.tenant
  
  // Validate tenant param - must be a string for prefetching
  const tenantSlug = typeof tenantParam === 'string' ? tenantParam : null

  const handleMouseEnter = useCallback(() => {
    if (!tenantSlug) return
    // Prefetch product detail data when user hovers over the card
    prefetchProductDetail(tenantSlug, item.id).catch(() => {
      // Silently fail - prefetching is optional
    })
  }, [tenantSlug, item.id])

  const handleTouchStart = useCallback(() => {
    if (!tenantSlug) return
    // Also prefetch on touch start for mobile devices
    prefetchProductDetail(tenantSlug, item.id).catch(() => {
      // Silently fail
    })
  }, [tenantSlug, item.id])

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
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
