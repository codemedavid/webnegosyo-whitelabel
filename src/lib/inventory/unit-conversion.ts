/**
 * Pure unit-of-measure conversion for the inventory system.
 *
 * Every unit belongs to a single `dimension` (weight / volume / count) and
 * carries a `to_base_factor` — how many canonical base units one of it holds
 * (grams for weight, millilitres for volume, pieces for count). Conversion
 * within a dimension is therefore just a ratio of factors. Cross-dimension
 * conversion (e.g. cups → grams) needs an ingredient-specific density and is
 * intentionally NOT supported here; callers must handle that upstream.
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

/** Convert a quantity expressed in `unit` into the dimension's base unit. */
export function toBaseQuantity(qty: number, unit: InventoryUnit): number {
  assertFinite(qty)
  return qty * unit.to_base_factor
}

/**
 * Convert `qty` from one unit to another within the same dimension.
 * Throws if the units belong to different dimensions or the quantity is not
 * finite.
 */
export function convertQuantity(qty: number, from: InventoryUnit, to: InventoryUnit): number {
  assertFinite(qty)
  if (from.dimension !== to.dimension) {
    throw new Error(
      `Cannot convert across dimensions: ${from.abbreviation} (${from.dimension}) → ${to.abbreviation} (${to.dimension})`,
    )
  }
  if (from.id === to.id) return qty
  return (qty * from.to_base_factor) / to.to_base_factor
}
