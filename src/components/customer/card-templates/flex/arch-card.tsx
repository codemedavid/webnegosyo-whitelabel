'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, Price, SoldOutVeil, tint, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const ARCH_DEFAULTS: CardStyle = {
  imageRatio: 'portrait',
  imageFit: 'cover',
  addButton: 'pill',
  textAlign: 'center',
  description: 'show',
  density: 'comfortable',
}

/**
 * Arch — the specialty-café card (Sweetgreen, Blue Bottle, bakeries).
 * The photo is framed in an arch, like a shop window, on a softly tinted
 * field. Type is centered and airy; the add button is a calm pill under the
 * price. The arch lifts a little on hover.
 */
export const ArchCard = memo(function ArchCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, ARCH_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className={`group @container relative flex h-full flex-col rounded-[var(--brand-radius,24px)] ${density.pad}`}
      style={{ backgroundColor: tint(branding.primary, 6, branding.cards) }}
    >
      <div className="relative transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1">
        <CardMedia
          item={item}
          branding={branding}
          style={style}
          priority={priority}
          panel={tint(branding.primary, 12, branding.cards)}
          className="rounded-t-[999px] rounded-b-[calc(var(--brand-radius,24px)*0.6)]"
          imageClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        >
          {!isOrderable && <SoldOutVeil />}
        </CardMedia>
        <CardBadges
          item={item}
          menuEngineeringEnabled={menuEngineeringEnabled}
          discountPercent={discountPercent}
          background={branding.cards}
          color={branding.cardTitle}
          saleBackground={branding.error}
          className="inset-x-0 bottom-2.5 justify-center"
        />
      </div>

      <div className={`flex flex-1 flex-col pt-3 @xs:pt-4 ${density.gap} ${isCentered ? 'items-center text-center' : 'items-start text-left'}`}>
        <CardTitleButton
          item={item}
          onSelect={onSelect}
          className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] [text-wrap:balance] @xs:text-[18px]"
          style={{ color: branding.cardTitle }}
        />
        {showDescription && (
          <p className="line-clamp-2 max-w-[34ch] text-[12.5px] leading-relaxed @xs:text-[13.5px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}
        <div className={`mt-auto flex w-full flex-col gap-2.5 pt-1.5 ${isCentered ? 'items-center' : 'items-start'}`}>
          <Price
            price={displayPrice}
            compareAt={hasDiscount ? item.price : null}
            hasOptions={hasOptions}
            hideCurrencySymbol={hideCurrencySymbol}
            color={branding.cardPrice}
            saleColor={branding.error}
            mutedColor={branding.textMuted}
            className="text-[15px] font-semibold @xs:text-[17px]"
          />
          <AddButton
            item={item}
            variant={style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={branding.buttonPrimary}
            color={branding.buttonPrimaryText}
            className={`${style.addButton === 'bar' ? 'rounded-full' : ''} hover:opacity-90`}
          />
        </div>
      </div>
    </article>
  )
})
