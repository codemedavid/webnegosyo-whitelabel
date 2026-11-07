/**
 * Auto-86, the I/O half: read the dishes a batch of stock changes can affect,
 * decide on the shelf as it stands (`decideAuto86`), write the result.
 *
 * Runs after the ledger rows are written, so the ingredient quantities read
 * here already include them — and include every other order that landed in
 * between, which is the point. Deciding from "before + my delta" lost any
 * crossing a concurrent order made, and a lost crossing to empty was never
 * found again.
 *
 * Every read is scoped to the tenant and checked: a read that fails throws, and
 * nothing is written from a partial picture. The caller (`stock-alerts-service`)
 * never lets that reach a customer.
 *
 * Service role, like the rest of the order pipeline: a customer's order has no
 * admin session and inventory RLS is staff-only.
 */

import { decideAuto86, type Auto86Dish } from '@/lib/inventory/auto-86'
import { toJudgedShelf, type JudgedShelfRow, type JudgeOptions } from '@/lib/inventory/judged-shelf'
import { selectAllPages, type PageRequest, type PageResponse } from '@/lib/storefront/paged-select'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

/** Ids per `.in()` filter, so a long list never builds an over-long URL. */
const IN_CHUNK = 150

export interface Auto86Result {
  disabled: string[]
  reEnabled: string[]
}

/** The slice of a PostgREST builder these reads use. */
interface Query {
  select: (columns: string, options?: { count: 'exact' }) => Query
  eq: (column: string, value: unknown) => Query
  in: (column: string, values: readonly unknown[]) => Query
  order: (column: string, options: { ascending: boolean }) => Query
  range: (from: number, to: number) => PromiseLike<PageResponse<{ id: string }>>
}

interface UpdateQuery {
  eq: (column: string, value: unknown) => UpdateQuery
  in: (column: string, values: readonly unknown[]) => UpdateQuery
  not: (column: string, operator: string, value: unknown) => UpdateQuery
  select: (columns: string) => PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>
}

interface Client {
  from: (table: string) => Query & { update: (patch: Record<string, unknown>) => UpdateQuery }
}

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = []
  for (let index = 0; index < values.length; index += IN_CHUNK) out.push(values.slice(index, index + IN_CHUNK))
  return out
}

/** Every row of `table` for this tenant whose `column` is in `values`, paged and checked. */
async function readIn<T>(
  client: Client,
  table: string,
  columns: string,
  tenantId: string,
  column: string,
  values: readonly string[],
): Promise<T[]> {
  const rows: T[] = []
  for (const slice of chunks([...new Set(values)])) {
    const result = await selectAllPages<{ id: string }>(
      ({ from, to, withCount }: PageRequest) =>
        client
          .from(table)
          .select(columns, withCount ? { count: 'exact' } : undefined)
          .eq('tenant_id', tenantId)
          .in(column, slice)
          .order('id', { ascending: true })
          .range(from, to),
      { label: `${table} for auto-86 (tenant ${tenantId})` },
    )
    if (result.error) throw new Error(`auto-86: reading ${table} failed: ${result.error.message}`)
    rows.push(...(result.data as unknown as T[]))
  }
  return rows
}

async function readUnits(client: Client, tenantId: string): Promise<InventoryUnit[]> {
  const result = await selectAllPages<{ id: string }>(
    ({ from, to, withCount }: PageRequest) =>
      client
        .from('inventory_units')
        .select('id, name, abbreviation, dimension, to_base_factor', withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to),
    { label: `inventory_units for auto-86 (tenant ${tenantId})` },
  )
  if (result.error) throw new Error(`auto-86: reading inventory_units failed: ${result.error.message}`)
  return result.data as unknown as InventoryUnit[]
}

/** The ids an UPDATE … RETURNING really matched; a refused or failed write reports nothing. */
async function applyUpdate(
  client: Client,
  tenantId: string,
  ids: readonly string[],
  patch: Record<string, unknown>,
  narrow: (query: UpdateQuery) => UpdateQuery,
): Promise<string[]> {
  const matched: string[] = []
  for (const slice of chunks(ids)) {
    const { data, error } = await narrow(client.from('menu_items').update(patch).eq('tenant_id', tenantId).in('id', slice)).select('id')
    if (error) {
      console.error('[inventory] auto-86 menu update failed', tenantId, error.message)
      continue
    }
    matched.push(...(data ?? []).map((row) => row.id))
  }
  return matched
}

/**
 * 86 or restore every dish whose BASE recipe uses one of these ingredients,
 * judged on the shelf as it stands now. Throws on a failed read.
 */
export async function reconcileAuto86(
  supabase: unknown,
  tenantId: string,
  ingredientIds: readonly string[],
  now: Date = new Date(),
  options: JudgeOptions = {},
): Promise<Auto86Result> {
  const none: Auto86Result = { disabled: [], reEnabled: [] }
  if (ingredientIds.length === 0) return none
  const client = supabase as Client

  const touching = await readIn<RecipeComponent>(
    client, 'recipe_components', 'id, recipe_id, inventory_item_id', tenantId, 'inventory_item_id', ingredientIds,
  )
  if (touching.length === 0) return none

  const recipes = (
    await readIn<Recipe>(
      client,
      'recipes',
      'id, target_type, menu_item_id, variation_option_id, addon_id, modifier_option_id',
      tenantId,
      'id',
      touching.map((component) => component.recipe_id),
    )
  ).filter((recipe) => recipe.target_type === 'menu_item' && Boolean(recipe.menu_item_id))
  if (recipes.length === 0) return none

  // EVERY component of those recipes, not just the rows naming a moved
  // ingredient: "can one serving be made" needs the whole recipe, or a dish
  // comes back while another of its ingredients is still empty.
  const components = await readIn<RecipeComponent>(
    client, 'recipe_components', 'id, recipe_id, inventory_item_id, quantity, unit_id', tenantId, 'recipe_id',
    recipes.map((recipe) => recipe.id),
  )
  const [ingredients, units, dishes] = await Promise.all([
    readIn<JudgedShelfRow>(
      client, 'inventory_items', 'id, stock_unit_id, current_qty, is_active, counted_at', tenantId, 'id',
      components.map((component) => component.inventory_item_id),
    ),
    readUnits(client, tenantId),
    readIn<Auto86Dish>(
      client, 'menu_items', 'id, is_available, auto_disabled_at, auto_86_snoozed_until', tenantId, 'id',
      recipes.map((recipe) => recipe.menu_item_id as string),
    ),
  ])

  const shelf = toJudgedShelf(ingredients, new Map(units.map((unit) => [unit.id, unit])), options)
  const decision = decideAuto86(dishes, recipes, components, shelf, units, now.getTime())

  const disabled = decision.disable.length === 0
    ? []
    : await applyUpdate(client, tenantId, decision.disable, { is_available: false, auto_disabled_at: now.toISOString() },
        // Only a dish still on sale: a person may have turned it off meanwhile.
        (query) => query.eq('is_available', true))
  const reEnabled = decision.reEnable.length === 0
    ? []
    : await applyUpdate(client, tenantId, decision.reEnable, { is_available: true, auto_disabled_at: null },
        // Ownership in the statement itself: only a dish THIS system still holds.
        (query) => query.eq('is_available', false).not('auto_disabled_at', 'is', null))

  return { disabled, reEnabled }
}

/**
 * 86 or restore every dish with a recipe, with no ingredient having moved: for
 * when the rule itself changed (auto-86 switched on, the store's stock policy
 * changed). Throws on a failed read.
 */
export async function reconcileWholeMenu(
  supabase: unknown,
  tenantId: string,
  now: Date = new Date(),
  options: JudgeOptions = {},
): Promise<Auto86Result> {
  const client = supabase as Client
  const result = await selectAllPages<{ id: string }>(
    ({ from, to, withCount }: PageRequest) =>
      client
        .from('recipe_components')
        .select('id, inventory_item_id', withCount ? { count: 'exact' } : undefined)
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to),
    { label: `recipe_components for auto-86 (tenant ${tenantId})` },
  )
  if (result.error) throw new Error(`auto-86: reading recipe_components failed: ${result.error.message}`)
  const ingredientIds = (result.data as unknown as Array<{ inventory_item_id: string }>).map((row) => row.inventory_item_id)
  return reconcileAuto86(supabase, tenantId, ingredientIds, now, options)
}
