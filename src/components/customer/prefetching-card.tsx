'use client'

import { memo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CardTemplateRenderer } from './card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface PrefetchingCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Card wrapper that prefetches the product detail route on hover/touch only.
 * Memoized to prevent re-renders from parent state changes (e.g. carousel slide).
 */
export const PrefetchingCard = memo(function PrefetchingCard({ item, onSelect, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol }: PrefetchingCardProps) {
  const params = useParams()
  const router = useRouter()
  const hasPrefetched = useRef(false)

  const tenantParam = params.tenant
  const tenantSlug = typeof tenantParam === 'string' ? tenantParam : null

  // Lightweight prefetch on hover/touch only – no data queries, just route prefetch
  const handleInteraction = useCallback(() => {
    if (!tenantSlug || hasPrefetched.current) return
    router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)
    hasPrefetched.current = true
  }, [tenantSlug, item.id, router])

  return (
    <div
      onMouseEnter={handleInteraction}
      onTouchStart={handleInteraction}
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
