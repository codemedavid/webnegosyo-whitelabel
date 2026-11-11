import type { Addon } from '@/types/database'

export const MAX_ADDON_QUANTITY = 99

/** Missing quantities are old one-portion selections. Invalid values fail closed. */
export function addonQuantity(addon: Pick<Addon, 'quantity'>): number {
  const quantity = addon.quantity ?? 1
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= MAX_ADDON_QUANTITY
    ? quantity : 0
}

export function addonLabel(addon: Pick<Addon, 'name' | 'quantity'>): string {
  const quantity = addonQuantity(addon)
  return quantity > 1 ? `${addon.name} ×${quantity}` : addon.name
}

/** An add-on as any view holds it: a cart selection or a stored order line. */
export interface PricedAddon {
  name: string
  price?: number | null
  quantity?: number
}

type FormatMoney = (amount: number) => string

/**
 * "Fried Rice ×2 (+₱30.00)": what the add-on adds to ONE dish, every portion
 * included. Free, unknown or unreadable prices show the name alone, so a
 * missing price never reads as "+₱0".
 */
export function addonPriceLabel(addon: PricedAddon, formatMoney: FormatMoney): string {
  const label = addonLabel(addon)
  const price = addon.price
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return label
  return `${label} (+${formatMoney(price * addonQuantity(addon))})`
}

export function addonPriceList(addons: readonly PricedAddon[], formatMoney: FormatMoney): string {
  return addons.map((addon) => addonPriceLabel(addon, formatMoney)).join(', ')
}

export function addonCartKey(addon: Pick<Addon, 'id' | 'quantity'>): string {
  const quantity = addonQuantity(addon)
  return quantity === 1 ? addon.id : `${addon.id}:qty=${quantity}`
}

export function setAddonQuantity(addons: readonly Addon[], addon: Addon, quantity: number): Addon[] {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_ADDON_QUANTITY) return [...addons]
  if (quantity === 0) return addons.filter(a => a.id !== addon.id)
  const selected = { ...addon, quantity }
  return addons.some(a => a.id === addon.id)
    ? addons.map(a => a.id === addon.id ? selected : a)
    : [...addons, selected]
}
