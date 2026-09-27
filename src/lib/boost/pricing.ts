/**
 * Combo pricing helpers shared by the merchant builder and the idea engine.
 *
 * "Regular price" matches what the storefront menu card strikes through
 * (`bundle-adapter.ts`): each pick's cheapest choice × how many are picked.
 */

/** Below this a combo is priced in whole pesos, not charm-rounded. */
const CHARM_FLOOR = 20
/** The default discount a suggested combo price aims for. */
const DEFAULT_COMBO_DISCOUNT = 0.1

export interface ComboPickPrices {
  prices: readonly number[]
  count: number
}

export interface Savings {
  amount: number
  percent: number
}

/** Round DOWN to a price ending in 9 (₱222 → ₱219), the way menus are priced. */
export function charmPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const whole = Math.floor(value)
  if (whole < CHARM_FLOOR) return whole
  const candidate = Math.floor((whole + 1) / 10) * 10 - 1
  return candidate > whole ? candidate - 10 : candidate
}

export function comboRegularPrice(picks: readonly ComboPickPrices[]): number {
  return picks.reduce((sum, pick) => {
    if (pick.prices.length === 0) return sum
    return sum + Math.min(...pick.prices) * Math.max(1, pick.count)
  }, 0)
}

/** A charm price about 10% under regular — always strictly cheaper. */
export function suggestComboPrice(regularPrice: number, discount = DEFAULT_COMBO_DISCOUNT): number {
  if (regularPrice <= 0) return 0
  const target = charmPrice(regularPrice * (1 - discount))
  if (target > 0 && target < regularPrice) return target
  return Math.max(0, Math.ceil(regularPrice) - 1)
}

export function describeSavings(regularPrice: number, comboPrice: number): Savings | null {
  if (regularPrice <= 0 || comboPrice >= regularPrice) return null
  const amount = Math.round((regularPrice - comboPrice) * 100) / 100
  return { amount, percent: Math.round((amount / regularPrice) * 100) }
}
