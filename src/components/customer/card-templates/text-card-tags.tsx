import type { CSSProperties } from 'react'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { dishBadgeLabel } from '@/lib/dish-photo'
import { readableOn } from '@/lib/card-color'

interface TextCardTagsProps {
  item: MenuItem
  branding: BrandingColors
  isOrderable: boolean
  hasDiscount: boolean
  menuEngineeringEnabled?: boolean
  /** The template's own wording for a dish that can't be ordered. */
  soldOutLabel?: string
  /** Row layout (alignment, spacing). */
  className?: string
  /** Each tag's shape and type, so a tag speaks the template's language. */
  tagClassName?: string
  soldOutStyle?: CSSProperties
  badgeStyle?: CSSProperties
  saleStyle?: CSSProperties
}

/**
 * The labels a photo card overlays on its photo (sold out, badge, sale),
 * set inline for a dish without a photo so a text card loses none of them.
 * Colors default to the tenant's branding; templates may restyle each tag.
 */
export function TextCardTags({
  item,
  branding,
  isOrderable,
  hasDiscount,
  menuEngineeringEnabled,
  soldOutLabel = 'Sold out',
  className = '',
  tagClassName = 'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
  soldOutStyle,
  badgeStyle,
  saleStyle,
}: TextCardTagsProps) {
  const badge = dishBadgeLabel(item, menuEngineeringEnabled)
  if (isOrderable && !badge && !hasDiscount) return null

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {!isOrderable && (
        <span
          className={tagClassName}
          style={{ backgroundColor: branding.cardTitle, color: branding.cards, ...soldOutStyle }}
        >
          {soldOutLabel}
        </span>
      )}
      {badge && (
        <span
          className={tagClassName}
          style={{
            backgroundColor: branding.primary,
            color: branding.buttonPrimaryText || readableOn(branding.primary),
            ...badgeStyle,
          }}
        >
          {badge}
        </span>
      )}
      {hasDiscount && (
        <span className={tagClassName} style={{ backgroundColor: branding.error, color: '#ffffff', ...saleStyle }}>
          Sale
        </span>
      )}
    </div>
  )
}
