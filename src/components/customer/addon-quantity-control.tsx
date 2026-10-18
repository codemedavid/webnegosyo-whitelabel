'use client'

import type { CSSProperties } from 'react'
import { MAX_ADDON_QUANTITY } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'

const DEFAULT_FREE_LABEL = 'Free'

// Colours come from the product page theme's Add-ons section (--pd-addon-*).
// Outside the product page (the edit-item modal) the variables are unset: the
// row stays transparent, inherits the text colour and uses the UI border.
const ROW_STYLE: CSSProperties = {
  backgroundColor: 'var(--pd-addon-bg)',
  color: 'var(--pd-addon-text)',
  borderColor: 'var(--pd-addon-border, var(--border))',
}

const PICKED_ROW_STYLE: CSSProperties = {
  backgroundColor: 'var(--pd-addon-selected-bg)',
  color: 'var(--pd-addon-selected-text)',
  borderColor: 'var(--pd-addon-selected-border, var(--border))',
}

const PRICE_STYLE: CSSProperties = { color: 'var(--pd-addon-price)' }
const PICKED_PRICE_STYLE: CSSProperties = { opacity: 0.85 }

const STEPPER_STYLE: CSSProperties = { borderColor: 'currentcolor' }

/** Shared by legacy extras and unified quantity groups. */
export function AddonQuantityControl({ name, price, quantity, onChange, disabled = false, atMax = false, hideCurrencySymbol, freeLabel = DEFAULT_FREE_LABEL }: {
  name: string
  price: number
  quantity: number
  onChange: (quantity: number) => void
  disabled?: boolean
  atMax?: boolean
  hideCurrencySymbol?: boolean
  freeLabel?: string
}) {
  const priceLabel = price === 0 ? freeLabel : `${price > 0 ? '+' : ''}${formatPrice(price, { hideCurrencySymbol })} each`
  return (
    <div data-addon-row data-branding-scope="product/addon-option" className={`flex w-full items-center justify-between gap-3 rounded-lg p-3 ${quantity > 0 ? 'border-2' : 'border'}`} style={{ ...(quantity > 0 ? PICKED_ROW_STYLE : ROW_STYLE), borderRadius: 'var(--pd-card-radius, 0.5rem)', transitionProperty: 'background-color, color, border-color', transitionDuration: 'var(--pd-transition-duration)' }}>
      <div className="min-w-0">
        <span className="text-sm font-medium">{name}</span>
        {/* A picked row's price takes the row's picked text colour, so it stays
            readable on the picked fill. */}
        <span className="ml-2 text-sm" style={quantity > 0 ? PICKED_PRICE_STYLE : PRICE_STYLE}>{priceLabel}</span>
        {disabled && <span className="ml-2 text-xs opacity-70">(sold out)</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={`Decrease ${name}`} disabled={quantity === 0} onClick={() => onChange(quantity - 1)} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40" style={STEPPER_STYLE}>−</button>
        <output aria-label={`${name} quantity`} aria-live="polite" className="min-w-5 text-center tabular-nums">{quantity}</output>
        <button type="button" aria-label={`Increase ${name}`} disabled={disabled || atMax || quantity >= MAX_ADDON_QUANTITY} onClick={() => onChange(quantity + 1)} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40" style={STEPPER_STYLE}>+</button>
      </div>
    </div>
  )
}
