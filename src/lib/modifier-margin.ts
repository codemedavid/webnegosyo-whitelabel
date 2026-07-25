/**
 * Margin helpers for the Modifier Groups editor.
 *
 * Pure and side-effect free. Combines the option pricing/cost rules from
 * `modifier-groups` with the generic `computeMargin` rollup so the editor can
 * show live per-option and per-item margin without duplicating the math in JSX.
 */

import { resolveOptionCostForOption } from '@/lib/inventory/cost-mode'
import { computeMargin, type Margin } from '@/lib/inventory/costing'
import type { ModifierOption } from '@/types/database'

export interface PricedMargin extends Margin {
  price: number
  cost: number
}

/**
 * Live margin for a single option. Price = base item price + the option's price
 * modifier. Cost follows the option's `cost_mode` — its manual cost in simple
 * mode, its attached recipe cost in composite mode. Options with no mode keep
 * the legacy rule (recipe overrides manual).
 */
export function computeOptionMargin(
  basePrice: number,
  option: ModifierOption,
  recipeCost?: number,
): PricedMargin {
  const price = basePrice + option.price_modifier
  const cost = resolveOptionCostForOption(option, recipeCost)
  return { price, cost, ...computeMargin(price, cost) }
}

/** Margin for the base item itself (its own price against its own cost). */
export function computeItemMarginSummary(basePrice: number, baseCost: number): PricedMargin {
  return { price: basePrice, cost: baseCost, ...computeMargin(basePrice, baseCost) }
}
