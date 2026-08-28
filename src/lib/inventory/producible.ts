/**
 * How many of a dish the kitchen can actually make, and whether a cart asks
 * for more than that.
 *
 * Every stock guard the platform had before this was BINARY and RETROSPECTIVE.
 * Auto-86 (`auto-86.ts`) takes a dish off the menu once an ingredient has
 * already reached zero — which means the order that emptied the shelf was
 * accepted in full. `loyverse/stock-check.ts` asks only whether a variant is
 * above zero. Neither answers the question a diner's quantity stepper actually
 * poses: *is there enough for the number I am buying?*
 *
 * Pure, like `low-stock.ts` and `auto-86.ts`, and for the same reason: the cart
 * needs this to cap a stepper, checkout needs it to refuse an order, and the
 * admin needs it to show a ceiling. A second opinion between them would be a
 * customer told "5 left" by one screen and refused by another.
 *
 * TWO BIASES, both inherited from the existing depletion path:
 *
 *   1. **Untracked means unlimited.** A dish with no base recipe, an empty
 *      recipe shell, or a recipe naming an ingredient this tenant does not
 *      stock has no ceiling. Most menus are only partly costed, and refusing
 *      good orders is a worse failure than occasionally overselling — the same
 *      trade `resolveOrderDepletions` and `findOutOfStockLines` already make.
 *
 *   2. **Only judgeable shortages count.** An unknown, inactive, or
 *      unconvertible ingredient is passed over rather than read as zero. Zero
 *      is a claim about the shelf; silence is not.
 *
 * Only a BASE recipe constrains, matching auto-86: an ingredient used solely by
 * a variation option or addon leaves the dish sellable in its other
 * configurations, and option-level ceilings need per-option availability that
 * does not exist yet.
 */

import { resolveConfiguredRecipeIds } from '@/lib/inventory/graph-builder'
import { convertQuantity, type InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

/**
 * Quantities are NUMERIC(16,4) in the database, so anything below a
 * ten-thousandth is round-trip dust. Same constant, same reasoning as
 * `low-stock.ts` — here it also stops binary floating point (0.1 × 3 =
 * 0.30000000000000004) from costing the merchant a whole sellable unit.
 */
const QUANTITY_EPSILON = 1e-4

/** The subset of an ingredient a ceiling depends on. */
export interface ProducibleStock {
  id: string
  /** On-hand quantity, expressed in `stockUnit`. */
  current_qty: number
  is_active: boolean
  stockUnit: InventoryUnit
}

/** A dish, in the configuration it was ordered in. */
export interface ProducibleTarget {
  menuItemId: string
  optionIds?: string[]
  addonIds?: string[]
  modifierOptionIds?: string[]
}

export interface CartStockLine extends ProducibleTarget {
  quantity: number
}

export interface CartStockShortfall {
  menuItemId: string
  /** How many the cart asked for, across every line naming this dish. */
  requested: number
  /** How many the shelf can actually cover. */
  producible: number
}

/** What one unit of a dish takes off the shelf, in each ingredient's stock unit. */
interface UnitNeed {
  ingredientId: string
  quantity: number
}

function indexStock(stock: readonly ProducibleStock[]): Map<string, ProducibleStock> {
  const byId = new Map<string, ProducibleStock>()
  for (const item of stock) {
    // Inactive is not "empty" — it is an ingredient nobody is counting any
    // more, so it has no opinion on what can be made.
    if (!item.is_active) continue
    byId.set(item.id, item)
  }
  return byId
}

function indexUnits(units: readonly InventoryUnit[]): Map<string, InventoryUnit> {
  return new Map(units.map((unit) => [unit.id, unit]))
}

function indexComponents(
  components: readonly RecipeComponent[],
): Map<string, RecipeComponent[]> {
  const byRecipe = new Map<string, RecipeComponent[]>()
  for (const component of components) {
    const list = byRecipe.get(component.recipe_id) ?? []
    list.push(component)
    byRecipe.set(component.recipe_id, list)
  }
  return byRecipe
}

/**
 * What one unit of `target` consumes, already converted into each ingredient's
 * own stock unit and merged per ingredient.
 *
 * Components this cannot judge — an ingredient with no stock row, an inactive
 * one, or a unit that will not convert (grams of an ingredient stocked by the
 * piece needs a density nobody has recorded) — are dropped, not zeroed.
 */
function resolveUnitNeeds(
  target: ProducibleTarget,
  recipes: readonly Recipe[],
  componentsByRecipe: ReadonlyMap<string, RecipeComponent[]>,
  stockById: ReadonlyMap<string, ProducibleStock>,
  unitsById: ReadonlyMap<string, InventoryUnit>,
): UnitNeed[] {
  const configured = resolveConfiguredRecipeIds(
    target.menuItemId,
    target.optionIds ?? [],
    target.addonIds ?? [],
    recipes,
    target.modifierOptionIds ?? [],
  )

  if (!configured.baseRecipeId) return []

  const totals = new Map<string, number>()
  for (const component of componentsByRecipe.get(configured.baseRecipeId) ?? []) {
    const ingredient = stockById.get(component.inventory_item_id)
    if (!ingredient) continue

    const needed = Number(component.quantity)
    if (!Number.isFinite(needed) || needed <= 0) continue

    const inStockUnit = convertToStockUnit(needed, component.unit_id, ingredient, unitsById)
    if (inStockUnit === null) continue

    totals.set(
      component.inventory_item_id,
      (totals.get(component.inventory_item_id) ?? 0) + inStockUnit,
    )
  }

  return [...totals].map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
}

/**
 * A component quantity expressed in the unit its ingredient is stocked in.
 *
 * `recipe_components` stores a unit *id*, so the tenant's unit catalogue is
 * what makes the conversion possible. Null — dropped, never zeroed — when the
 * unit is not in the catalogue, or when the conversion is one nobody can make:
 * grams of something stocked by the piece needs a density this system does not
 * record, and guessing it would corrupt a ceiling rather than admit ignorance.
 */
function convertToStockUnit(
  quantity: number,
  unitId: string,
  ingredient: ProducibleStock,
  unitsById: ReadonlyMap<string, InventoryUnit>,
): number | null {
  if (unitId === ingredient.stockUnit.id) return quantity

  const unit = unitsById.get(unitId)
  if (!unit) return null

  try {
    return convertQuantity(quantity, unit, ingredient.stockUnit)
  } catch {
    return null
  }
}

/** Whole units of `needs` that `remaining` covers. */
function unitsFrom(
  needs: readonly UnitNeed[],
  remaining: ReadonlyMap<string, number>,
): number {
  let ceiling = Infinity
  for (const need of needs) {
    const onHand = remaining.get(need.ingredientId) ?? 0
    // The epsilon is added to the numerator so 0.30000000000000004 / 0.1
    // floors to 3 rather than 2 — dust must not cost a sellable unit.
    ceiling = Math.min(ceiling, Math.floor((onHand + QUANTITY_EPSILON) / need.quantity))
  }
  return Math.max(0, ceiling)
}

/**
 * How many whole units of a dish the shelf can cover, or `null` when the dish
 * is not stock-tracked and therefore has no ceiling.
 */
export function resolveProducibleUnits(
  target: ProducibleTarget,
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  stock: readonly ProducibleStock[],
  units: readonly InventoryUnit[],
): number | null {
  const stockById = indexStock(stock)
  const needs = resolveUnitNeeds(
    target,
    recipes,
    indexComponents(components),
    stockById,
    indexUnits(units),
  )
  if (needs.length === 0) return null

  const remaining = new Map<string, number>()
  for (const need of needs) {
    remaining.set(need.ingredientId, stockById.get(need.ingredientId)?.current_qty ?? 0)
  }

  return unitsFrom(needs, remaining)
}

/**
 * The lines of a cart that ask for more than the kitchen can make.
 *
 * The cart is judged as a WHOLE, not line by line: two dishes sharing one
 * ingredient must not both be granted it. Lines are walked in cart order and
 * each takes what it is granted off a running shelf, so an earlier line is
 * served in full and the shortfall lands on the later one — the same order the
 * kitchen would fill them in.
 *
 * Lines naming the same dish are merged first. Three plus three of one pizza is
 * six pizzas; reported as two lines of three, each would look satisfiable.
 */
export function findCartStockShortfalls(
  lines: readonly CartStockLine[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  stock: readonly ProducibleStock[],
  units: readonly InventoryUnit[],
): CartStockShortfall[] {
  const stockById = indexStock(stock)
  const componentsByRecipe = indexComponents(components)
  const unitsById = indexUnits(units)

  const remaining = new Map<string, number>()
  for (const item of stockById.values()) remaining.set(item.id, item.current_qty)

  const merged = new Map<string, CartStockLine>()
  for (const line of lines) {
    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const existing = merged.get(line.menuItemId)
    merged.set(line.menuItemId, {
      ...line,
      quantity: (existing?.quantity ?? 0) + quantity,
    })
  }

  const shortfalls: CartStockShortfall[] = []
  for (const line of merged.values()) {
    const needs = resolveUnitNeeds(line, recipes, componentsByRecipe, stockById, unitsById)
    if (needs.length === 0) continue // Untracked: no ceiling to breach.

    const producible = unitsFrom(needs, remaining)
    const granted = Math.min(line.quantity, producible)

    for (const need of needs) {
      const onHand = remaining.get(need.ingredientId) ?? 0
      remaining.set(need.ingredientId, onHand - need.quantity * granted)
    }

    if (producible < line.quantity) {
      shortfalls.push({
        menuItemId: line.menuItemId,
        requested: line.quantity,
        producible,
      })
    }
  }

  return shortfalls
}

/** What a dish is called when its name did not survive to the caller. */
const UNNAMED_DISH = 'One of your items'

/**
 * The message a diner is shown when their cart outruns the kitchen.
 *
 * Written for someone standing at a checkout button, so it says what is left
 * rather than what went wrong. "0 left" is spelled "sold out": a count of zero
 * reads as a quantity to try, and it is not.
 */
export function describeStockShortfalls(
  shortfalls: readonly CartStockShortfall[],
  nameByMenuItemId: ReadonlyMap<string, string>,
): string {
  if (shortfalls.length === 0) return ''

  const parts = shortfalls.map((shortfall) => {
    const name = nameByMenuItemId.get(shortfall.menuItemId) ?? UNNAMED_DISH
    if (shortfall.producible <= 0) return `${name} is sold out`
    return `${name} has only ${shortfall.producible} left`
  })

  return `Sorry — ${parts.join(', ')}. Please adjust your cart and try again.`
}
