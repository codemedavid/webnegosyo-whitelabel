'use client'

import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { CardTemplateRenderer } from './card-templates'

interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
}

export function MenuItemCard({ item, onSelect, branding, template = 'classic' }: MenuItemCardProps) {
  return (
    <CardTemplateRenderer
      template={template}
      item={item}
      onSelect={onSelect}
      branding={branding}
    />
  )
}

// Legacy implementation kept for reference
/* eslint-disable @typescript-eslint/no-unused-vars */
function LegacyMenuItemCard({ item, onSelect, branding }: Omit<MenuItemCardProps, 'template'>) {
  const formatPrice = (price: number) => `₱${price.toFixed(2)}`
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return null // Legacy code - kept for reference only
}
/* eslint-enable @typescript-eslint/no-unused-vars */

