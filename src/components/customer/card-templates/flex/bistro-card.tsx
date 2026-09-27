'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, Price, SoldOutVeil, readableOn, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const BISTRO_DEFAULTS: CardStyle = {
  imageRatio: 'wide',
  imageFit: 'cover',
  addButton: 'pill',
  textAlign: 'start',
  description: 'show',
  density: 'spacious',
}

/** The pill grows into the roomy "Add" button of the design; a bar stays round-ended. */
const ADD_SHAPE_CLASS: Partial<Record<CardStyle['addButton'], string>> = {
  pill: '@xs:h-11 @xs:px-6 @xs:text-[15px]',
  bar: 'rounded-full',
}

/**
 * Bistro — the clean café-site card (Squarespace / Toast menus).
 * A white card with a wide photo flush to its top edge, the dish name in
 * serif capitals, a two-line description, and the price on the left of a
 * solid pill "Add" button. Calm and legible in a 2-3 column grid.
 */
export const BistroCard = memo(function BistroCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, BISTRO_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]
  const addBackground = branding.buttonPrimary
  const addColor = branding.buttonPrimaryText || readableOn(addBackground)

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className="group @container relative flex h-full flex-col overflow-hidden rounded-[var(--brand-radius,16px)] border shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-300 hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
      style={{ backgroundColor: branding.cards, borderColor: branding.cardsBorder }}
    >
      <div className="relative">
        <CardMedia
          item={item}
          branding={branding}
          style={style}
          priority={priority}
          imageClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        >
          {!isOrderable && <SoldOutVeil label="Unavailable" />}
        </CardMedia>
        <CardBadges
          item={item}
          menuEngineeringEnabled={menuEngineeringEnabled}
          discountPercent={discountPercent}
          background={branding.cards}
          color={branding.cardTitle}
          saleBackground={branding.error}
          className="left-2.5 top-2.5"
        />
      </div>

      <div className={`flex flex-1 flex-col ${density.pad} ${density.gap} ${isCentered ? 'items-center text-center' : 'items-start text-left'}`}>
        <CardTitleButton
          item={item}
          onSelect={onSelect}
          className="line-clamp-2 font-serif text-[15px] font-semibold uppercase leading-tight tracking-[0.01em] @xs:text-[20px]"
          style={{ color: branding.cardTitle }}
        />
        {showDescription && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed @xs:text-[15px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}
        <div
          className={`mt-auto flex w-full flex-wrap items-center gap-2 pt-2 @xs:pt-3 ${
            isCentered ? 'flex-col justify-center' : 'justify-between'
          }`}
        >
          <Price
            price={displayPrice}
            compareAt={hasDiscount ? item.price : null}
            hasOptions={hasOptions}
            hideCurrencySymbol={hideCurrencySymbol}
            color={branding.cardPrice}
            saleColor={branding.error}
            mutedColor={branding.textMuted}
            className="text-[15px] font-bold @xs:text-[20px]"
          />
          <AddButton
            item={item}
            variant={style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={addBackground}
            color={addColor}
            label="Add"
            showGlyph={false}
            className={`${ADD_SHAPE_CLASS[style.addButton] ?? ''} hover:opacity-90`}
          />
        </div>
      </div>
    </article>
  )
})
