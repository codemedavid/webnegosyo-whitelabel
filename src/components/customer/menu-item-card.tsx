'use client'

import { memo } from 'react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { CardTemplateRenderer } from './card-templates'

interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

export const MenuItemCard = memo(function MenuItemCard({ item, onSelect, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol }: MenuItemCardProps) {
  return (
    <div style={{ contentVisibility: 'auto' }}>
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
