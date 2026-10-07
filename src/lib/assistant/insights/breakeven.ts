/**
 * Promotion break-even: how many more sales a discount needs before it earns
 * the store as much as it does today. Pure.
 *
 * Margin = price − food cost. Food cost is the dish's real recipe cost when
 * inventory costing has it, otherwise an ASSUMED share of the price — always
 * labelled, because the answer is only as good as that number.
 */

export const DEFAULT_FOOD_COST_PCT = 35

export type PromoMechanic =
  | { kind: 'percent_off'; value: number }
  | { kind: 'amount_off'; value: number }
  | { kind: 'combo_price'; value: number }

export interface CostedItem {
  name: string
  price: number
  /** Recipe cost per serving; null when unknown. */
  unitCost: number | null
  /** Units sold in the reference window, when known. */
  unitsSold?: number | null
}

export interface BreakevenLine {
  name: string
  regularPrice: number
  promoPrice: number
  unitCost: number
  costBasis: 'recipe' | 'assumed'
  marginBefore: number
  marginAfter: number
  /** Percent more units needed to earn the same; null when the promo loses money on every sale. */
  requiredLiftPct: number | null
  /** Today's units and the units needed at the promo price, when sales are known. */
  unitsNow: number | null
  unitsNeeded: number | null
  losesMoney: boolean
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function costOf(item: CostedItem, assumedPct: number): { cost: number; basis: 'recipe' | 'assumed' } {
  return item.unitCost !== null && item.unitCost >= 0
    ? { cost: item.unitCost, basis: 'recipe' }
    : { cost: round2((item.price * assumedPct) / 100), basis: 'assumed' }
}

function line(name: string, price: number, promoPrice: number, cost: number, basis: 'recipe' | 'assumed', unitsNow: number | null): BreakevenLine {
  const marginBefore = round2(price - cost)
  const marginAfter = round2(promoPrice - cost)
  const losesMoney = marginAfter <= 0
  const ratio = !losesMoney && marginBefore > 0 ? marginBefore / marginAfter : null
  return {
    name,
    regularPrice: round2(price),
    promoPrice: round2(promoPrice),
    unitCost: round2(cost),
    costBasis: basis,
    marginBefore,
    marginAfter,
    requiredLiftPct: ratio === null ? null : Math.round((ratio - 1) * 1000) / 10,
    unitsNow: unitsNow ?? null,
    unitsNeeded: ratio === null || unitsNow == null ? null : Math.ceil(unitsNow * ratio),
    losesMoney,
  }
}

/**
 * One line per dish for a per-dish discount, or ONE line for a combo price
 * (the dishes' prices and costs summed, units = the least-sold dish).
 */
export function computeBreakeven(items: readonly CostedItem[], mechanic: PromoMechanic, assumedPct = DEFAULT_FOOD_COST_PCT): BreakevenLine[] {
  if (items.length === 0) return []
  if (mechanic.kind === 'combo_price') {
    const costs = items.map((item) => costOf(item, assumedPct))
    const regular = items.reduce((sum, item) => sum + item.price, 0)
    const cost = costs.reduce((sum, c) => sum + c.cost, 0)
    const basis = costs.every((c) => c.basis === 'recipe') ? 'recipe' : 'assumed'
    const known = items.map((item) => item.unitsSold).filter((units): units is number => typeof units === 'number')
    const unitsNow = known.length === items.length ? Math.min(...known) : null
    return [line(items.map((item) => item.name).join(' + '), regular, mechanic.value, cost, basis, unitsNow)]
  }
  return items.map((item) => {
    const { cost, basis } = costOf(item, assumedPct)
    const promoPrice =
      mechanic.kind === 'percent_off' ? item.price * (1 - mechanic.value / 100) : Math.max(0, item.price - mechanic.value)
    return line(item.name, item.price, promoPrice, cost, basis, item.unitsSold ?? null)
  })
}
