'use client'

import { MAX_ADDON_QUANTITY } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'

/** Shared by legacy extras and unified quantity groups. */
export function AddonQuantityControl({ name, price, quantity, onChange, disabled = false, atMax = false, hideCurrencySymbol }: {
  name: string
  price: number
  quantity: number
  onChange: (quantity: number) => void
  disabled?: boolean
  atMax?: boolean
  hideCurrencySymbol?: boolean
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--pd-border)', color: 'var(--pd-variation-text)', background: 'var(--pd-variation-bg)' }}>
      <div className="min-w-0">
        <span className="text-sm font-medium">{name}</span>
        <span className="ml-2 text-sm opacity-75">{price === 0 ? 'Free' : `${price > 0 ? '+' : ''}${formatPrice(price, { hideCurrencySymbol })}`} each</span>
        {disabled && <span className="ml-2 text-xs opacity-70">(sold out)</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={`Decrease ${name}`} disabled={quantity === 0} onClick={() => onChange(quantity - 1)} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40">−</button>
        <output aria-label={`${name} quantity`} aria-live="polite" className="min-w-5 text-center tabular-nums">{quantity}</output>
        <button type="button" aria-label={`Increase ${name}`} disabled={disabled || atMax || quantity >= MAX_ADDON_QUANTITY} onClick={() => onChange(quantity + 1)} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40">+</button>
      </div>
    </div>
  )
}
