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
