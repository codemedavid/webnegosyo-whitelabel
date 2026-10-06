/**
 * Pure unit-of-measure conversion for the inventory system.
 *
 * Every unit belongs to a single `dimension` (weight / volume / count) and
 * carries a `to_base_factor` — how many canonical base units one of it holds
 * (grams for weight, millilitres for volume, pieces for count). Conversion
 * within a dimension is therefore just a ratio of factors.
 *
 * Weight and volume are bridged at water density (1 g = 1 ml). Merchants buy
 * syrups, sauces and milk by the litre and measure them by the gram; refusing
 * that conversion made every such recipe line deplete nothing. Water density is
 * close enough for kitchen liquids and far better than zero. Count never
 * converts — a piece of mango and a piece of cup have no common weight.
 */

export type UnitDimension = 'weight' | 'volume' | 'count'

export interface InventoryUnit {
  id: string
  name: string
  abbreviation: string
  dimension: UnitDimension
  /** How many base-dimension units one of this unit equals (base unit = 1). */
  to_base_factor: number
}

function assertFinite(qty: number): void {
  if (!Number.isFinite(qty)) {
    throw new Error(`Quantity must be a finite number, received ${qty}`)
  }
}

/** Grams in one millilitre: the weight/volume bridge (water density). */
export const GRAMS_PER_MILLILITRE = 1

const MASS_LIKE: ReadonlySet<UnitDimension> = new Set(['weight', 'volume'])

/** Base units of `from` that one base unit of `to` equals, or null if none. */
function baseRatio(from: InventoryUnit, to: InventoryUnit): number | null {
  if (from.dimension === to.dimension) return 1
  if (!MASS_LIKE.has(from.dimension) || !MASS_LIKE.has(to.dimension)) return null
  // grams → millilitres divides by density; millilitres → grams multiplies.
  return from.dimension === 'volume' ? GRAMS_PER_MILLILITRE : 1 / GRAMS_PER_MILLILITRE
}

/** Whether a quantity in `from` can be expressed in `to`. */
export function canConvertUnits(from: InventoryUnit, to: InventoryUnit): boolean {
  return baseRatio(from, to) !== null
}

function requireRatio(from: InventoryUnit, to: InventoryUnit, what: string): number {
  const ratio = baseRatio(from, to)
  if (ratio === null) {
    throw new Error(
      `Cannot convert ${what} across dimensions: ${from.abbreviation} (${from.dimension}) → ${to.abbreviation} (${to.dimension})`,
    )
  }
  return ratio
}

/** Convert a quantity expressed in `unit` into the dimension's base unit. */
export function toBaseQuantity(qty: number, unit: InventoryUnit): number {
  assertFinite(qty)
  return qty * unit.to_base_factor
}

/**
 * Convert `qty` from one unit to another. Throws if the units cannot be
 * converted (see `canConvertUnits`) or the quantity is not finite.
 */
export function convertQuantity(qty: number, from: InventoryUnit, to: InventoryUnit): number {
  assertFinite(qty)
  const ratio = requireRatio(from, to, 'a quantity')
  if (from.id === to.id) return qty
  return (qty * from.to_base_factor * ratio) / to.to_base_factor
}

/**
 * Convert a *price per unit* from one unit to another.
 *
 * This is the inverse of `convertQuantity` and deliberately its own function.
 * A quantity scales up when the unit gets smaller (2 kg is 2000 g) while a
 * price scales down (P120/kg is P0.12/g), so reusing `convertQuantity` on a
 * price does not merely fail to help — it moves the figure the wrong way by the
 * same factor. Their product, the total value of the stock, is what stays
 * constant, and that invariant is what this pair is tested against.
 */
export function convertUnitCost(cost: number, from: InventoryUnit, to: InventoryUnit): number {
  assertFinite(cost)
  const ratio = requireRatio(from, to, 'a price')
  if (from.id === to.id) return cost
  return (cost * to.to_base_factor) / (from.to_base_factor * ratio)
}
