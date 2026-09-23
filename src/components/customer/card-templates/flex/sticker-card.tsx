'use client'

import { memo } from 'react'
import { formatPrice } from '@/lib/cart-utils'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, SoldOutVeil, optionHint, readableOn, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const STICKER_DEFAULTS: CardStyle = {
  imageRatio: 'square',
  imageFit: 'cover',
  addButton: 'icon',
  textAlign: 'start',
  description: 'show',
  density: 'comfortable',
}

/** Sixteen-point starburst — the die-cut shape of a price sticker. */
const STARBURST = (() => {
  const points = 32
  return `polygon(${Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2
    const radius = i % 2 === 0 ? 50 : 44
    return `${(50 + radius * Math.cos(angle)).toFixed(2)}% ${(50 + radius * Math.sin(angle)).toFixed(2)}%`
  }).join(', ')})`
})()

/**
 * Sticker — the promo card. A die-cut starburst in the brand accent is slapped
 * across the photo's corner, tilted, carrying the price big (and the old price
 * small when it's on sale). The rest of the card stays calm so the sticker
 * shouts alone.
 */
export const StickerCard = memo(function StickerCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, STICKER_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]
  const sticker = branding.accent || branding.primary
  const stickerInk = readableOn(sticker, '#111111')
  const hint = optionHint(item)

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className="group @container relative flex h-full flex-col rounded-[var(--brand-radius,18px)] border transition-shadow duration-300 hover:shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: branding.cards, borderColor: branding.cardsBorder }}
    >
      <div className="relative">
        <CardMedia
          item={item}
          branding={branding}
          style={style}
          priority={priority}
          className="rounded-t-[calc(var(--brand-radius,18px)-1px)]"
          imageClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        >
          {!isOrderable && <SoldOutVeil />}
        </CardMedia>
        <CardBadges
          item={item}
          menuEngineeringEnabled={menuEngineeringEnabled}
          discountPercent={0}
          background={branding.cards}
          color={branding.cardTitle}
          saleBackground={branding.error}
          className="left-2.5 top-2.5"
        />

        {/* The sticker: tilted and die-cut. Narrow cards keep it on the photo;
            wider ones let it straddle the photo's lower edge. */}
        <div
          className="absolute bottom-2 right-2 z-[3] -rotate-[10deg] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-[4deg] group-hover:scale-105 @xs:-bottom-9 @xs:right-3"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))' }}
          data-branding-scope="storefront/card-price"
        >
          <div
            className="flex h-[70px] w-[70px] flex-col items-center justify-center leading-none @xs:h-[88px] @xs:w-[88px]"
            style={{ backgroundColor: sticker, color: stickerInk, clipPath: STARBURST }}
          >
            {hasDiscount && (
              <s className="text-[9px] font-semibold opacity-75 @xs:text-[11px]">
                {formatPrice(item.price, { hideCurrencySymbol })}
              </s>
            )}
            {hasOptions && !hasDiscount && <span className="text-[8.5px] font-bold uppercase tracking-wider @xs:text-[10px]">from</span>}
            <span className="mt-0.5 text-[15px] font-black tabular-nums tracking-[-0.03em] @xs:text-[19px]">
              {formatPrice(displayPrice, { hideCurrencySymbol })}
            </span>
            {discountPercent > 0 && (
              <span className="mt-0.5 text-[8.5px] font-extrabold uppercase @xs:text-[10px]">Save {discountPercent}%</span>
            )}
          </div>
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${density.pad} ${density.gap} ${isCentered ? 'items-center text-center @xs:pt-10' : 'items-start text-left'}`}>
        <CardTitleButton
          item={item}
          onSelect={onSelect}
          className={`line-clamp-2 text-[14.5px] font-extrabold leading-tight tracking-[-0.01em] @xs:text-[17px] ${isCentered ? '' : '@xs:pr-[84px]'}`}
          style={{ color: branding.cardTitle }}
        />
        {showDescription && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed @xs:text-[13.5px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}
        <div className={`mt-auto flex w-full items-center gap-2 pt-1 ${isCentered ? 'justify-center' : 'justify-between'}`}>
          {hint && !isCentered && (
            <span className="text-[11px] font-semibold" style={{ color: branding.textMuted }}>{hint}</span>
          )}
          <AddButton
            item={item}
            variant={style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={branding.buttonPrimary}
            color={branding.buttonPrimaryText}
            className={`${style.addButton === 'bar' ? 'rounded-[calc(var(--brand-radius,18px)*0.6)]' : ''} ${hint || isCentered ? '' : 'ml-auto'}`}
          />
        </div>
      </div>
    </article>
  )
})
