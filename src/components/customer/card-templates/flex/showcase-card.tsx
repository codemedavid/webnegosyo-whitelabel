'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, Price, SoldOutVeil, readableOn, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const SHOWCASE_DEFAULTS: CardStyle = {
  imageRatio: 'portrait',
  imageFit: 'cover',
  addButton: 'bar',
  textAlign: 'start',
  description: 'hide',
  density: 'comfortable',
}

/**
 * Showcase — the premium catalog card (Shopify Dawn / Prestige).
 * A tall borderless photo carries the card; name and price sit quietly under
 * it. On pointer devices a quick-add bar rises from the photo's foot on hover;
 * on touch it is a round button that never leaves.
 */
export const ShowcaseCard = memo(function ShowcaseCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, SHOWCASE_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]
  const addBackground = branding.buttonPrimary
  const addColor = branding.buttonPrimaryText || readableOn(addBackground)

  return (
    <article
      onClick={selectOnCardClick(item, onSelect)}
      className="group @container relative flex flex-col">
      <div className="relative">
        <CardMedia
          item={item}
          branding={branding}
          style={style}
          priority={priority}
          className="rounded-[var(--brand-radius,14px)]"
          imageClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.035]"
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
          className="left-2.5 top-2.5"
        />

        {style.addButton === 'bar' ? (
          <>
            {/* Pointer devices: a bar that rises into the photo on hover. */}
            <div className="absolute inset-x-2.5 bottom-2.5 z-10 hidden translate-y-2 opacity-0 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 [@media(hover:hover)]:block">
              <AddButton
                item={item}
                variant="bar"
                isOrderable={isOrderable}
                onSelect={onSelect}
                background={addBackground}
                color={addColor}
                label="Quick add"
                className="rounded-[calc(var(--brand-radius,14px)*0.7)] shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              />
            </div>
            {/* Touch: a round button that is always there. */}
            <div className="absolute bottom-2.5 right-2.5 z-10 [@media(hover:hover)]:hidden">
              <AddButton
                item={item}
                variant="icon"
                isOrderable={isOrderable}
                onSelect={onSelect}
                background={branding.cards}
                color={branding.cardTitle}
                className="shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
              />
            </div>
          </>
        ) : (
          <div className="absolute bottom-2.5 right-2.5 z-10">
            <AddButton
              item={item}
              variant={style.addButton}
              isOrderable={isOrderable}
              onSelect={onSelect}
              background={style.addButton === 'icon' ? branding.cards : addBackground}
              color={style.addButton === 'icon' ? branding.cardTitle : addColor}
              className="shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
            />
          </div>
        )}
      </div>

      <div
        className={`flex flex-col px-0.5 pt-2.5 @xs:pt-3.5 ${density.gap} ${isCentered ? 'items-center text-center' : 'items-start text-left'}`}
      >
        <CardTitleButton
          item={item}
          onSelect={onSelect}
          className="line-clamp-2 text-[14px] font-medium leading-snug tracking-[-0.01em] @xs:text-[16px]"
          style={{ color: branding.cardTitle }}
        />
        {showDescription && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed @xs:text-[13.5px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}
        <Price
          price={displayPrice}
          compareAt={hasDiscount ? item.price : null}
          hasOptions={hasOptions}
          hideCurrencySymbol={hideCurrencySymbol}
          color={branding.cardPrice}
          saleColor={branding.error}
          mutedColor={branding.textMuted}
          className="text-[14px] font-semibold @xs:text-[15px]"
        />
      </div>
    </article>
  )
})
