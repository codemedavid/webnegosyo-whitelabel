'use client'

import { memo, useCallback, useRef } from 'react'
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
 * Card wrapper that prefetches the product detail route on hover-capable devices.
 * Memoized to prevent re-renders from parent state changes (e.g. carousel slide).
 */
export const PrefetchingCard = memo(function PrefetchingCard({ item, onSelect, tenantSlug, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol }: PrefetchingCardProps) {
  const router = useRouter()
  const hasPrefetched = useRef(false)

  // Prefetch only for hover-capable pointers to avoid touch-scroll prefetch storms on mobile.
  const handleInteraction = useCallback(() => {
    if (hasPrefetched.current) return
    if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches) return
    router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)
    hasPrefetched.current = true
  }, [tenantSlug, item.id, router])

  return (
    <div
      onMouseEnter={handleInteraction}
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
