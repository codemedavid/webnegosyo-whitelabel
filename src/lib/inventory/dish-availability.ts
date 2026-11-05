/**
 * Turning a dish on or off by hand — and asking first when its stock reads
 * empty (2026-11-03).
 *
 * The Lolys incident: auto-86 hid six egg dishes; a person turned them back on
 * an hour later with nothing saying why they were off, and they sold Egg below
 * zero. The industry answer (Square "available again at end of day", Uber
 * Eats "sold out for today") is a time-boxed override, so here:
 *
 *   "Egg shows 0. Record a count · Sell anyway until end of day · Cancel"
 *
 * "Sell anyway" stamps `menu_items.auto_86_snoozed_until` with the end of the
 * store's business day: until then auto-86 leaves the dish on sale and the
 * checkout guard / ceilings do not limit it (`stock-graph-read.ts`). After it,
 * the next stock change judges the dish on the shelf again.
 *
 * One module for both callers — the web admin's server action and the merchant
 * app's route — so the question, and the override, are the same everywhere.
 */

import { readCutoffScheduleForDisplay, type SessionClient } from '@/lib/business-day/read-schedule'
import { tradingDayOf, tradingDayWindow } from '@/lib/business-day/trading-day'
import { toJudgedShelf, type JudgedShelfRow } from '@/lib/inventory/judged-shelf'
import { resolveProducibleUnits } from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

/** A base ingredient that cannot cover one serving of the dish. */
export interface DishStockBlocker {
  ingredientId: string
  name: string
  /** In the ingredient's stock unit. May be negative: the shelf was oversold. */
  onHand: number
  unit: string
}

/** The slice of a PostgREST builder these reads use. */
interface Query {
  select: (columns: string) => Query
  eq: (column: string, value: unknown) => Query
  in: (column: string, values: readonly unknown[]) => Query
  limit: (count: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}

interface ReadClient {
  from: (table: string) => Query
}

/** One dish's recipe is small; these bound a runaway read, they are not pages. */
const MAX_RECIPES = 50
const MAX_LINES = 500

async function read<T>(query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, table: string): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(`Couldn't read ${table}: ${error.message}`)
  return (data ?? []) as T[]
}

interface IngredientRow extends JudgedShelfRow {
  name: string
}

/**
 * The counted base ingredients of a dish that cannot cover one serving, in
 * recipe order. Empty when the dish has no recipe or every counted ingredient
 * can cover it. Throws on a failed read: "nothing missing" must be the truth.
 */
export async function readDishStockBlockers(
  supabase: unknown,
  tenantId: string,
  menuItemId: string,
): Promise<DishStockBlocker[]> {
  const client = supabase as ReadClient
  const recipes = (
    await read<Recipe>(
      client
        .from('recipes')
        .select('id, target_type, menu_item_id, variation_option_id, addon_id, modifier_option_id')
        .eq('tenant_id', tenantId)
        .eq('menu_item_id', menuItemId)
        .limit(MAX_RECIPES),
      'recipes',
    )
  ).filter((recipe) => recipe.target_type === 'menu_item')
  if (recipes.length === 0) return []

  const components = await read<RecipeComponent>(
    client
      .from('recipe_components')
      .select('id, recipe_id, inventory_item_id, quantity, unit_id')
      .eq('tenant_id', tenantId)
      .in('recipe_id', recipes.map((recipe) => recipe.id))
      .limit(MAX_LINES),
    'recipe_components',
  )
  if (components.length === 0) return []

  const [ingredients, units] = await Promise.all([
    read<IngredientRow>(
      client
        .from('inventory_items')
        .select('id, name, stock_unit_id, current_qty, is_active, counted_at')
        .eq('tenant_id', tenantId)
        .in('id', [...new Set(components.map((component) => component.inventory_item_id))])
        .limit(MAX_LINES),
      'inventory_items',
    ),
    read<InventoryUnit>(
      client
        .from('inventory_units')
        .select('id, name, abbreviation, dimension, to_base_factor')
        .eq('tenant_id', tenantId)
        .limit(MAX_LINES),
      'inventory_units',
    ),
  ])

  return findDishStockBlockers(menuItemId, recipes, components, ingredients, units)
}

/** Pure: which judged base ingredients alone make the dish unmakeable. */
export function findDishStockBlockers(
  menuItemId: string,
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  ingredients: readonly IngredientRow[],
  units: readonly InventoryUnit[],
): DishStockBlocker[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]))
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const order = [...new Set(components.map((component) => component.inventory_item_id))]

  return order.flatMap((ingredientId) => {
    const row = byId.get(ingredientId)
    if (!row) return []
    // Judged alone: only this ingredient is on the shelf, so only it can limit.
    const shelf = toJudgedShelf([row], unitsById)
    if (shelf.length === 0) return []
    const canMake = resolveProducibleUnits({ menuItemId }, recipes, components, shelf, units)
    if (canMake !== 0) return []
    return [{
      ingredientId,
      name: row.name,
      onHand: Number(row.current_qty),
      unit: shelf[0].stockUnit.abbreviation,
    }]
  })
}

/**
 * When "sell anyway" runs out: the end of the store's current business day
 * (its own cutoff — a bar open until 2 AM keeps the override through service).
 * A schedule that can't be read falls back to Manila midnight.
 */
export async function sellAnywayUntil(supabase: unknown, tenantId: string, now: Date = new Date()): Promise<string> {
  const { schedule } = await readCutoffScheduleForDisplay(supabase as SessionClient, tenantId)
  return tradingDayWindow(tradingDayOf(now.toISOString(), schedule), schedule).endIso
}

export interface DishAvailabilityPatch {
  is_available: boolean
  auto_disabled_at: null
  auto_86_snoozed_until: string | null
}

export type DishAvailabilityDecision =
  | { kind: 'confirm'; blockers: DishStockBlocker[]; sellAnywayUntil: string }
  | { kind: 'write'; patch: DishAvailabilityPatch }

/**
 * Pure: what a hand toggle does. Clearing `auto_disabled_at` hands the dish
 * back to the owner either way — auto-86 recovery only ever restores dishes
 * still carrying the marker, so leaving it would let the next delivery
 * overrule a person's decision.
 */
export function decideDishAvailabilityWrite(input: {
  isAvailable: boolean
  sellAnyway: boolean
  blockers: readonly DishStockBlocker[]
  sellAnywayUntil: string
}): DishAvailabilityDecision {
  if (!input.isAvailable) {
    return { kind: 'write', patch: { is_available: false, auto_disabled_at: null, auto_86_snoozed_until: null } }
  }
  if (input.blockers.length === 0) {
    return { kind: 'write', patch: { is_available: true, auto_disabled_at: null, auto_86_snoozed_until: null } }
  }
  if (!input.sellAnyway) {
    return { kind: 'confirm', blockers: [...input.blockers], sellAnywayUntil: input.sellAnywayUntil }
  }
  return {
    kind: 'write',
    patch: { is_available: true, auto_disabled_at: null, auto_86_snoozed_until: input.sellAnywayUntil },
  }
}
