/**
 * The one read behind every producible-ceiling answer.
 *
 * Two callers need the same picture of a tenant's kitchen: the checkout guard
 * that refuses a cart, and the storefront ceilings that cap a quantity stepper.
 * They must not read it differently — a stepper that stops at 5 while the guard
 * refuses at 4 is worse than no stepper cap at all, because it teaches the
 * customer the number is trustworthy right before it isn't.
 *
 * Service-role, like the rest of the order pipeline: a diner has no session and
 * recipes are not theirs to read. Nothing from a request steers it beyond the
 * tenant and the branch.
 *
 * Returns `null` for every "no opinion" case — inventory off, a failed read —
 * so callers cannot accidentally treat a failure as an empty kitchen.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { selectAllPages, type PageRequest, type PageResponse } from '@/lib/storefront/paged-select'

/** The slice of a PostgREST builder a paged, tenant-scoped read uses. */
interface PagedQuery {
  select: (columns: string, options?: { count: 'exact' }) => PagedQuery
  eq: (column: string, value: string) => PagedQuery
  order: (column: string, options: { ascending: boolean }) => PagedQuery
  range: (from: number, to: number) => PromiseLike<PageResponse<{ id: string }>>
}
import type { ProducibleStock } from '@/lib/inventory/producible'
import { isCounted, toJudgedShelf } from '@/lib/inventory/judged-shelf'
import type { StockOptionCatalogItem } from '@/lib/inventory/option-stock'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { ModifierGroup, Recipe, RecipeComponent } from '@/types/database'

interface IngredientRow {
  id: string
  stock_unit_id: string
  current_qty: number
  is_active: boolean
  counted_at: string | null
}

interface BranchStockRow {
  inventory_item_id: string
  outlet_id: string | null
  current_qty: number
  counted_at: string | null
}

interface MenuItemRow {
  id: string
  name: string
  modifier_groups?: ModifierGroup[] | null
  /** "Sell anyway" until this instant: the dish is not stock-limited meanwhile. */
  auto_86_snoozed_until?: string | null
}

export interface TenantStockGraph {
  recipes: Recipe[]
  components: RecipeComponent[]
  /** The shelf as the ordering branch sees it. */
  shelf: ProducibleStock[]
  units: InventoryUnit[]
  /** Dish names, for anything that has to speak to a customer. */
  namesByMenuItemId: Map<string, string>
  /**
   * Each dish's option catalogue (`modifier_groups`): option names, simple-stock
   * options and linked options, so a line is judged the way depletion spends it
   * (`expandLinkedStockItems`). Absent reads as "no options known".
   */
  catalog?: StockOptionCatalogItem[]
}

/**
 * The shelf as the branch placing this order sees it.
 *
 * A store-wide read gets `inventory_items.current_qty`, already the roll-up
 * across every branch. A branch read gets its own `inventory_stock` row — and
 * an ingredient with NO row at that branch is DROPPED, not zeroed.
 *
 * That is deliberately the opposite of the admin screens, where a missing row
 * means zero because an owner needs to see what is really on that shelf. Here
 * the number decides whether a paying customer is turned away, and "this branch
 * never set up per-branch stock for flour" is ignorance, not an empty shelf.
 * Refusing on ignorance is how a merchant discovers this feature by losing a
 * day of orders.
 *
 * The same holds for a shelf nobody has COUNTED (`judged-shelf.ts`): a row a
 * sale created at a branch that never received the ingredient, or an
 * ingredient set up but never received anywhere, has no limit.
 */
function resolveShelf(
  ingredients: readonly IngredientRow[],
  units: ReadonlyMap<string, InventoryUnit>,
  branchStock: readonly BranchStockRow[],
  outletId: string | null,
): ProducibleStock[] {
  if (!outletId) return toJudgedShelf(ingredients, units)

  const branchShelf = new Map<string, BranchStockRow>()
  for (const row of branchStock) {
    if (row.outlet_id === outletId) branchShelf.set(row.inventory_item_id, row)
  }

  // The branch's own shelf, counted there; no row or no count = unjudgeable.
  return toJudgedShelf(
    ingredients.flatMap((ingredient) => {
      const shelf = branchShelf.get(ingredient.id)
      if (!shelf || !isCounted(shelf)) return []
      return [{ ...ingredient, current_qty: shelf.current_qty, counted_at: shelf.counted_at }]
    }),
    units,
  )
}

/**
 * Recipes of every dish whose owner chose "sell anyway" are left out while
 * that holds, so neither the checkout guard nor any ceiling limits it: the
 * owner has told us the shelf reading is wrong today.
 */
function withoutSnoozedDishes(recipes: readonly Recipe[], menuItems: readonly MenuItemRow[], nowMs: number): Recipe[] {
  const snoozed = new Set(
    menuItems
      .filter((item) => {
        const until = item.auto_86_snoozed_until ? Date.parse(item.auto_86_snoozed_until) : NaN
        return Number.isFinite(until) && until > nowMs
      })
      .map((item) => item.id),
  )
  if (snoozed.size === 0) return [...recipes]
  return recipes.filter((recipe) => !recipe.menu_item_id || !snoozed.has(recipe.menu_item_id))
}

/**
 * Everything needed to answer "how many of this can the kitchen make?", or
 * `null` when there is no opinion to be had.
 */
export async function readTenantStockGraph(
  tenantId: string,
  outletId: string | null = null,
  now: Date = new Date(),
): Promise<TenantStockGraph | null> {
  try {
    const supabase = createAdminClient()

    // The gate comes first and alone: a tenant who has not switched inventory
    // on must pay for none of the reads below.
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('inventory_enabled')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantError) return null
    if ((tenant as { inventory_enabled?: boolean | null } | null)?.inventory_enabled !== true) {
      return null
    }

    // Every table is paged past PostgREST's 1000-row cap: a big menu read
    // unpaged silently dropped recipes and branch rows, so its ceilings and
    // checkout guard under-counted what the shelf owes.
    const client = supabase as unknown as { from: (table: string) => PagedQuery }
    const paged = (table: string, columns: string) =>
      selectAllPages<{ id: string }>(
        ({ from, to, withCount }: PageRequest) => client
          .from(table)
          .select(columns, withCount ? { count: 'exact' } : undefined)
          .eq('tenant_id', tenantId)
          .order('id', { ascending: true })
          .range(from, to),
        { label: `${table} for tenant ${tenantId}` },
      )

    const [recipesResult, componentsResult, itemsResult, unitsResult, stockResult, menuResult] =
      await Promise.all([
        // Every target column: option recipes are matched by their own id.
        paged('recipes', 'id, target_type, menu_item_id, variation_option_id, addon_id, modifier_option_id'),
        paged('recipe_components', 'id, recipe_id, inventory_item_id, quantity, unit_id'),
        paged('inventory_items', 'id, name, stock_unit_id, current_qty, is_active, counted_at'),
        paged('inventory_units', 'id, name, abbreviation, dimension, to_base_factor'),
        paged('inventory_stock', 'id, inventory_item_id, outlet_id, current_qty, counted_at'),
        paged('menu_items', 'id, name, modifier_groups, auto_86_snoozed_until'),
      ])

    // A PostgREST error arrives as `error`, not as a throw. Without this the
    // reads read as "this tenant has no recipes" and every ceiling silently
    // disappears — for exactly the tenants whose database was struggling.
    const failure =
      recipesResult.error ??
      componentsResult.error ??
      itemsResult.error ??
      unitsResult.error ??
      stockResult.error ??
      menuResult.error
    if (failure) {
      console.error('[inventory] Stock graph read failed', tenantId, failure)
      return null
    }

    const units = (unitsResult.data ?? []) as unknown as InventoryUnit[]
    const unitsById = new Map(units.map((unit) => [unit.id, unit]))
    const menuItems = (menuResult.data ?? []) as unknown as MenuItemRow[]

    return {
      recipes: withoutSnoozedDishes((recipesResult.data ?? []) as unknown as Recipe[], menuItems, now.getTime()),
      components: (componentsResult.data ?? []) as unknown as RecipeComponent[],
      shelf: resolveShelf(
        (itemsResult.data ?? []) as unknown as IngredientRow[],
        unitsById,
        (stockResult.data ?? []) as unknown as BranchStockRow[],
        outletId,
      ),
      units,
      namesByMenuItemId: new Map(menuItems.map((item) => [item.id, item.name])),
      catalog: menuItems.map((item) => ({ id: item.id, modifier_groups: item.modifier_groups ?? null })),
    }
  } catch (error) {
    console.error('[inventory] Stock graph read failed', tenantId, error)
    return null
  }
}
