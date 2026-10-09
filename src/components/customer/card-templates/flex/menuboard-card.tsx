'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardMedia, CardTitleButton, Price, SoldOutVeil, optionHint, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const MENUBOARD_DEFAULTS: CardStyle = {
  imageRatio: 'square',
  imageFit: 'cover',
  addButton: 'icon',
  textAlign: 'start',
  description: 'show',
  density: 'compact',
}

const ROW_PADDING: Record<CardStyle['density'], string> = {
  compact: 'py-3',
  comfortable: 'py-4 @xs:py-5',
  spacious: 'py-5 @xs:py-7',
}

/** Thumbnail frame per image shape: a square reads as the café's round cup shot. */
const THUMB_CLASS: Record<CardStyle['imageRatio'], string> = {
  square: 'w-14 rounded-full @xs:w-[72px]',
  portrait: 'w-14 rounded-[var(--brand-radius,10px)] @xs:w-[68px]',
  landscape: 'w-[72px] rounded-[var(--brand-radius,10px)] @xs:w-24',
  wide: 'w-20 rounded-[var(--brand-radius,10px)] @xs:w-28',
}

/**
 * Menu Board — the café board, as a row. Text leads: the name runs into a
 * dotted leader that ends at the price, the way a chalkboard or printed menu
 * sets it, with a small photo at the side. Rows stack with hairlines, so a
 * whole category reads as one board. Narrow columns drop the leader and stack.
 */
export const MenuboardCard = memo(function MenuboardCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, hasOptions, showDescription } =
    useFlexCard(item, branding, MENUBOARD_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const hint = optionHint(item)
  const badge = menuEngineeringEnabled && item.badge_text ? item.badge_text : item.is_featured ? 'Featured' : null
  const price = (
    <Price
      price={displayPrice}
      compareAt={hasDiscount ? item.price : null}
      hasOptions={hasOptions}
      hideCurrencySymbol={hideCurrencySymbol}
      color={branding.cardPrice}
      saleColor={branding.error}
      mutedColor={branding.textMuted}
      className="whitespace-nowrap text-[14px] font-bold @xs:text-[16px]"
    />
  )

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className={`group @container relative flex h-full gap-3 border-b @xs:gap-4 ${ROW_PADDING[style.density]} ${isCentered ? 'flex-col items-center text-center' : 'items-start'}`}
      style={{ borderColor: branding.cardsBorder }}
    >
      <CardMedia
        item={item}
        branding={branding}
        style={style}
        priority={priority}
        className={`shrink-0 ${THUMB_CLASS[style.imageRatio]}`}
        imageClassName="transition-transform duration-500 group-hover:scale-110"
      >
        {!isOrderable && <SoldOutVeil label="Out" />}
      </CardMedia>

      <div className={`flex min-w-0 flex-1 flex-col gap-1 ${isCentered ? 'items-center' : ''}`}>
        {/* Wide rows: name ··········· price. Narrow rows: name, then price. */}
        <div className={`flex min-w-0 items-baseline gap-2 ${isCentered ? 'flex-col items-center gap-0.5' : 'flex-col @xs:flex-row'}`}>
          <CardTitleButton
            item={item}
            onSelect={onSelect}
            className="line-clamp-2 min-w-0 text-[14.5px] font-semibold leading-snug @xs:shrink-0 @xs:basis-auto @xs:text-[16.5px] @xs:max-w-[70%]"
            style={{ color: branding.cardTitle }}
          />
          {!isCentered && (
            <span
              aria-hidden
              className="hidden min-w-4 flex-1 translate-y-[-4px] border-b-2 border-dotted @xs:block"
              style={{ borderColor: branding.cardsBorder }}
            />
          )}
          {price}
        </div>

        {showDescription && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed @xs:text-[13.5px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}

        <div className={`flex items-center gap-2 pt-0.5 ${isCentered ? 'justify-center' : ''}`}>
          {badge && (
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: branding.primary }}>
              {badge}
            </span>
          )}
          {hint && <span className="text-[11px]" style={{ color: branding.textMuted }}>{hint}</span>}
          <AddButton
            item={item}
            variant={style.addButton === 'bar' ? 'pill' : style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={branding.buttonPrimary}
            color={branding.buttonPrimaryText}
            className={`${isCentered ? '' : 'ml-auto'} ${style.addButton === 'icon' ? '!h-8 !w-8' : '!h-8'}`}
          />
        </div>
      </div>
    </article>
  )
})
