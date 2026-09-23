'use client'

/**
 * Flex card kit — the shared anatomy of the flexible card templates.
 *
 * Every flexible template (showcase, atelier, kiosk, sticker, menuboard, arch)
 * is a composition of these parts, so the merchant's Card style knobs (image
 * shape/fit, add button, alignment, description, spacing) mean the same thing
 * on every design. Templates own their look; the kit owns the rules:
 *
 *  - price, compare-at and "from" logic
 *  - sold-out state (orderability is decided once, upstream, and passed in)
 *  - the tappable-card pattern: the dish name is a real <button> stretched over
 *    the card, so the add button beside it is never a button inside a button
 *  - container-query sizing: cards size to their column, not the viewport, so
 *    one design reads right in a 1-up phone list and a 4-up desktop grid
 *
 * Colors always come from tenant branding; nothing here assumes a palette.
 */

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { resolveCardStyle, type CardStyle } from '@/lib/card-style'
import type { MenuItem } from '@/types/database'
import { readableOn, tint } from '@/lib/card-color'

export { readableOn, tint }

export interface FlexCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  isOrderable: boolean
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  priority?: boolean
}

export const RATIO_CLASS: Record<CardStyle['imageRatio'], string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  landscape: 'aspect-[4/3]',
  wide: 'aspect-[16/9]',
}

/** Inner padding + vertical rhythm per spacing choice. */
export const DENSITY_CLASS: Record<CardStyle['density'], { pad: string; gap: string }> = {
  compact: { pad: 'p-2.5 @xs:p-3', gap: 'gap-1' },
  comfortable: { pad: 'p-3 @xs:p-4', gap: 'gap-1.5 @xs:gap-2' },
  spacious: { pad: 'p-4 @xs:p-6', gap: 'gap-2 @xs:gap-3' },
}

export const CARD_IMAGE_SIZES = '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw'

/** Everything a template needs to know about one dish, resolved once. */
export function useFlexCard(item: MenuItem, branding: BrandingColors, templateDefaults: CardStyle) {
  const style = resolveCardStyle(branding.cardStyle, templateDefaults)
  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  const displayPrice = hasDiscount ? (item.discounted_price as number) : item.price
  const discountPercent = hasDiscount ? Math.round((1 - displayPrice / item.price) * 100) : 0
  const hasOptions = (item.variations?.length ?? 0) > 0 || (item.variation_types?.length ?? 0) > 0
  const showDescription = style.description === 'show' && Boolean(item.description?.trim())
  return { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription }
}

interface CardMediaProps {
  item: MenuItem
  branding: BrandingColors
  style: CardStyle
  priority?: boolean
  /** Panel color behind a contained dish (or behind a missing photo). */
  panel?: string
  className?: string
  imageClassName?: string
  mediaStyle?: CSSProperties
  children?: ReactNode
}

/**
 * The dish photo in the chosen shape. `contain` floats the dish on the panel
 * color with breathing room (packshot style); `cover` fills the frame. With no
 * photo and no logo, the dish's initial stands in, set large on the panel.
 */
export function CardMedia({
  item, branding, style, priority, panel, className = '', imageClassName = '', mediaStyle, children,
}: CardMediaProps) {
  const isContained = style.imageFit === 'contain'
  const hasImage = Boolean(item.image_url || branding.logoUrl)
  const panelColor = panel ?? tint(branding.primary, 8, branding.cards)

  return (
    <div
      className={`relative overflow-hidden ${RATIO_CLASS[style.imageRatio]} ${className}`}
      style={{ backgroundColor: panelColor, ...mediaStyle }}
    >
      {hasImage ? (
        <OptimizedImage
          src={item.image_url}
          fallbackSrc={branding.logoUrl}
          alt={item.name}
          fill
          className={`${isContained ? 'object-contain p-[9%] drop-shadow-[0_14px_18px_rgba(0,0,0,0.18)]' : 'object-cover'} ${imageClassName}`}
          sizes={CARD_IMAGE_SIZES}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-5xl font-black uppercase opacity-25"
          style={{ color: branding.primary }}
        >
          {item.name.trim().charAt(0)}
        </div>
      )}
      {children}
    </div>
  )
}

/** Sold-out veil over the photo. The card stays tappable so the dish can be read. */
export function SoldOutVeil({ label = 'Sold out' }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/45 backdrop-blur-[1.5px]">
      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-900">
        {label}
      </span>
    </div>
  )
}

interface PriceProps {
  price: number
  compareAt?: number | null
  hasOptions: boolean
  hideCurrencySymbol?: boolean
  color: string
  saleColor?: string
  mutedColor: string
  className?: string
  compareClassName?: string
}

/** Price with its "from" prefix and struck-through compare-at price. */
export function Price({
  price, compareAt, hasOptions, hideCurrencySymbol, color, saleColor, mutedColor, className = '', compareClassName = '',
}: PriceProps) {
  const isOnSale = Boolean(compareAt && compareAt > price)
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span
        className={`tabular-nums ${className}`}
        data-branding-scope="storefront/card-price"
        style={{ color: isOnSale && saleColor ? saleColor : color }}
      >
        {hasOptions && <span className="mr-0.5 text-[0.72em] font-medium opacity-75">from</span>}
        {formatPrice(price, { hideCurrencySymbol })}
      </span>
      {isOnSale && (
        <s className={`text-[0.78em] tabular-nums ${compareClassName}`} style={{ color: mutedColor }}>
          {formatPrice(compareAt as number, { hideCurrencySymbol })}
        </s>
      )}
    </span>
  )
}

interface AddButtonProps {
  item: MenuItem
  variant: CardStyle['addButton']
  isOrderable: boolean
  onSelect: (item: MenuItem) => void
  background: string
  color: string
  label?: string
  className?: string
  buttonStyle?: CSSProperties
}

const PlusGlyph = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/**
 * The add control in the merchant's chosen shape. Sits above the stretched
 * card button (z-10) so both stay independently clickable.
 */
export function AddButton({
  item, variant, isOrderable, onSelect, background, color, label = 'Add', className = '', buttonStyle,
}: AddButtonProps) {
  if (variant === 'hidden') return null

  const shape = {
    icon: 'h-9 w-9 @xs:h-10 @xs:w-10 justify-center rounded-full',
    pill: 'h-9 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold',
    bar: 'h-11 w-full justify-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.08em]',
  }[variant]

  return (
    <button
      type="button"
      disabled={!isOrderable}
      aria-label={`Add ${item.name}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(item)
      }}
      className={`relative z-10 inline-flex shrink-0 cursor-pointer items-center transition-[transform,opacity] duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${shape} ${className}`}
      style={{ backgroundColor: background, color, ...buttonStyle }}
    >
      <PlusGlyph className={variant === 'bar' ? 'h-4 w-4' : 'h-[15px] w-[15px]'} />
      {variant !== 'icon' && <span>{isOrderable ? label : 'Sold out'}</span>}
    </button>
  )
}

/**
 * Click handler for a card's root. Opens the dish when the click lands on the
 * card itself (a programmatic click, or any spot the stretched title button
 * does not cover) and ignores clicks that came from a button, which already
 * handled themselves, so a tap never opens the dish twice.
 */
export function selectOnCardClick(item: MenuItem, onSelect: (item: MenuItem) => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    onSelect(item)
  }
}

interface CardTitleButtonProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  className?: string
  style?: CSSProperties
  as?: 'h3' | 'h4'
}

/**
 * The dish name as the card's primary action. Its ::after stretches over the
 * nearest `relative` ancestor (the card), making the whole card tappable.
 */
export function CardTitleButton({ item, onSelect, className = '', style, as: Heading = 'h3' }: CardTitleButtonProps) {
  return (
    <Heading className={className} style={style} data-branding-scope="storefront/card-title">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="cursor-pointer text-inherit after:absolute after:inset-0 after:z-[2] after:content-[''] focus-visible:outline-none [&:focus-visible]:after:rounded-[inherit] [&:focus-visible]:after:ring-2 [&:focus-visible]:after:ring-current"
        style={{ textAlign: 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
      >
        {item.name}
      </button>
    </Heading>
  )
}

interface CardBadgeProps {
  item: MenuItem
  menuEngineeringEnabled?: boolean
  discountPercent: number
  background: string
  color: string
  saleBackground: string
  className?: string
}

/** Merchandising labels: the merchant's badge text (or Featured), then the sale %. */
export function CardBadges({
  item, menuEngineeringEnabled, discountPercent, background, color, saleBackground, className = '',
}: CardBadgeProps) {
  const label = menuEngineeringEnabled && item.badge_text ? item.badge_text : item.is_featured ? 'Featured' : null
  if (!label && discountPercent <= 0) return null
  return (
    <div className={`pointer-events-none absolute z-[3] flex flex-wrap gap-1 ${className}`}>
      {label && (
        <span className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em]" style={{ backgroundColor: background, color }}>
          {label}
        </span>
      )}
      {discountPercent > 0 && (
        <span
          className="rounded-full px-2 py-[3px] text-[10px] font-bold tabular-nums"
          style={{ backgroundColor: saleBackground, color: readableOn(saleBackground) }}
        >
          −{discountPercent}%
        </span>
      )}
    </div>
  )
}

/** Number of options, for the small "3 sizes" style hints. */
export function optionHint(item: MenuItem): string | null {
  const groups = item.variation_types?.length ?? 0
  if (groups > 0) return groups === 1 ? `${item.variation_types?.[0]?.options?.length ?? 0} options` : 'Customizable'
  const flat = item.variations?.length ?? 0
  return flat > 0 ? `${flat} sizes` : null
}
