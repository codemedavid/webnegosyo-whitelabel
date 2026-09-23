'use client'

import { memo, useCallback } from 'react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import { CardTemplateRenderer } from './card-templates'
import { useEagerImages } from '@/components/customer/eager-images-context'

interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  /** Above-the-fold card: image loads eagerly with high fetch priority. */
  priority?: boolean
}

export const MenuItemCard = memo(function MenuItemCard({ item, onSelect, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol, priority }: MenuItemCardProps) {
  /*
   * Every template disables its own "+" button, but the card *body* is a
   * separate click target that routes to the product page — where the dish can
   * be added anyway. Thirteen designs each own that body click, so the guard
   * sits here, on the one wrapper they all render through, for the same reason
   * the click-to-inspect tag does: no template can opt out of it.
   */
  const handleSelect = useCallback(
    (selected: MenuItem) => {
      if (!isMenuItemOrderable(selected)) return
      onSelect(selected)
    },
    [onSelect],
  )

  // A copy of the layout hidden on this viewport must not fetch eagerly.
  const isEagerAllowed = useEagerImages()

  return (
    // Click-to-inspect tag lives on the card wrapper (not the grid) so every
    // layout — grid-focus, magazine, mosaic, horizontal scroll — is covered.
    // h-full lets designs that fill their grid cell (the flexible templates)
    // line up row by row; fixed-height designs are unaffected.
    <div className="h-full" style={{ contentVisibility: 'auto' }} data-branding-scope="storefront/cards">
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={handleSelect}
        branding={branding}
        menuEngineeringEnabled={menuEngineeringEnabled}
        hideCurrencySymbol={hideCurrencySymbol}
        priority={Boolean(priority) && isEagerAllowed}
      />
    </div>
  )
})
