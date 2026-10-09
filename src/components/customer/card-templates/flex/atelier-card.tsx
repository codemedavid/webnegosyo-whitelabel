'use client'

import { memo } from 'react'
import type { CardStyle } from '@/lib/card-style'
import {
  AddButton, selectOnCardClick, CardBadges, CardMedia, CardTitleButton, DENSITY_CLASS, Price, SoldOutVeil, optionHint, tint, useFlexCard,
  type FlexCardProps,
} from './card-kit'

const ATELIER_DEFAULTS: CardStyle = {
  imageRatio: 'square',
  imageFit: 'contain',
  addButton: 'pill',
  textAlign: 'start',
  description: 'show',
  density: 'comfortable',
}

/**
 * Atelier — the boutique card (Aesop, Glossier, specialty grocers).
 * The dish floats on a soft brand-tinted panel like a packshot; below, a
 * hairline, the name and price on one line, a short note, and a quiet
 * outlined "Add". Restraint is the design: no shadows, no chrome.
 */
export const AtelierCard = memo(function AtelierCard({
  item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority,
}: FlexCardProps) {
  const { style, hasDiscount, displayPrice, discountPercent, hasOptions, showDescription } =
    useFlexCard(item, branding, ATELIER_DEFAULTS)
  const isCentered = style.textAlign === 'center'
  const density = DENSITY_CLASS[style.density]
  const hint = optionHint(item)
  const isOutlined = style.addButton === 'pill'

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
          panel={tint(branding.primary, 7, branding.cards)}
          className="rounded-[var(--brand-radius,6px)]"
          imageClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05] group-hover:-translate-y-1"
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
      </div>

      <div
        className={`mt-3 flex flex-1 flex-col border-t pt-3 ${density.gap} ${isCentered ? 'items-center text-center' : 'items-stretch text-left'}`}
        style={{ borderColor: branding.cardsBorder }}
      >
        <div className={`flex gap-3 ${isCentered ? 'flex-col items-center gap-1' : 'items-baseline justify-between'}`}>
          <CardTitleButton
            item={item}
            onSelect={onSelect}
            className="line-clamp-2 min-w-0 text-[14px] font-medium leading-snug tracking-[-0.005em] @xs:text-[16px]"
            style={{ color: branding.cardTitle }}
          />
          <Price
            price={displayPrice}
            compareAt={hasDiscount ? item.price : null}
            hasOptions={hasOptions}
            hideCurrencySymbol={hideCurrencySymbol}
            color={branding.cardPrice}
            saleColor={branding.error}
            mutedColor={branding.textMuted}
            className="whitespace-nowrap text-[13.5px] @xs:text-[15px]"
          />
        </div>

        {showDescription && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed @xs:text-[13.5px]" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}

        <div className={`mt-auto flex items-center gap-3 pt-1.5 ${isCentered ? 'justify-center' : 'justify-between'}`}>
          {hint && !isCentered && (
            <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: branding.textMuted }}>
              {hint}
            </span>
          )}
          <AddButton
            item={item}
            variant={style.addButton}
            isOrderable={isOrderable}
            onSelect={onSelect}
            background={isOutlined ? 'transparent' : branding.buttonPrimary}
            color={isOutlined ? branding.cardTitle : branding.buttonPrimaryText}
            buttonStyle={isOutlined ? { boxShadow: `inset 0 0 0 1px ${branding.cardTitle}` } : undefined}
            className={`${style.addButton === 'bar' ? 'rounded-[var(--brand-radius,6px)]' : ''} ${isOutlined ? 'h-8 hover:opacity-70' : ''}`}
          />
        </div>
      </div>
    </article>
  )
})
