'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, Price, SoldOutVeil, readableOn, tint, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const KIOSK_DEFAULTS: CardStyle = {
  imageRatio: 'square',
  imageFit: 'contain',
  addButton: 'bar',
  textAlign: 'center',
  description: 'hide',
  density: 'comfortable',
}

/**
 * Kiosk — the fast-food ordering-screen tile (Jollibee, McDonald's kiosks).
 * The whole tile is the brand color. The food sits on a lit disc, the name is
 * set loud and upper-case, the price rides a chip in the accent color, and a
 * full-width bar in the inverse color owns the foot of the tile.
 */
export const KioskCard = memo(function KioskCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, KIOSK_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]
  const tile = branding.primary
  const ink = readableOn(tile)
  const chip = branding.accent || branding.secondary
  const isContained = style.imageFit === 'contain'

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className="group @container relative flex h-full flex-col overflow-hidden rounded-[var(--brand-radius,22px)] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1"
      style={{ backgroundColor: tile, color: ink }}
    >
      <div className={isContained ? 'px-3 pt-3 @xs:px-5 @xs:pt-5' : ''}>
        <CardMedia
          item={item}
          branding={branding}
          style={style}
          priority={priority}
          panel="transparent"
          mediaStyle={isContained
            ? { backgroundImage: `radial-gradient(circle at 50% 54%, ${tint(ink, 16)} 0 57%, transparent 57.5%)` }
            : undefined}
          imageClassName="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.07] group-hover:-rotate-2"
        >
          {!isOrderable && <SoldOutVeil />}
        </CardMedia>
      </div>

      <CardBadges
        item={item}
        menuEngineeringEnabled={menuEngineeringEnabled}
        discountPercent={discountPercent}
        background={ink}
        color={tile}
        saleBackground={branding.error}
        className="left-3 top-3"
      />

      <div className={`flex flex-1 flex-col ${density.pad} ${density.gap} ${isCentered ? 'items-center text-center' : 'items-start text-left'}`}>
        <CardTitleButton
          item={item}
          onSelect={onSelect}
          className="line-clamp-2 text-[15px] font-black uppercase leading-[1.05] tracking-[-0.01em] @xs:text-[19px]"
        />
        {showDescription && (
          <p className="line-clamp-2 text-[12px] leading-snug @xs:text-[13px]" style={{ color: tint(ink, 78) }}>
            {item.description}
          </p>
        )}
        <span
          className="mt-auto inline-flex rounded-full px-3 py-1 text-[16px] font-black @xs:text-[20px]"
          style={{ backgroundColor: chip }}
        >
          <Price
            price={displayPrice}
            compareAt={hasDiscount ? item.price : null}
            hasOptions={hasOptions}
            hideCurrencySymbol={hideCurrencySymbol}
            color={readableOn(chip, '#111111')}
            mutedColor={tint(readableOn(chip, '#111111'), 60)}
          />
        </span>
      </div>

      {style.addButton === 'bar' ? (
        <AddButton
          item={item}
          variant="bar"
          isOrderable={isOrderable}
          onSelect={onSelect}
          background={ink}
          color={tile}
          className="h-12 hover:opacity-90"
        />
      ) : (
        <div className={`flex px-3 pb-3 @xs:px-4 @xs:pb-4 ${isCentered ? 'justify-center' : 'justify-end'}`}>
          <AddButton
            item={item}
            variant={style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={ink}
            color={tile}
          />
        </div>
      )}
    </article>
  )
})
