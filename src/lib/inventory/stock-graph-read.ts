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
import type { StockOptionCatalogItem } from '@/lib/inventory/option-stock'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { ModifierGroup, Recipe, RecipeComponent } from '@/types/database'

interface IngredientRow {
  id: string
  stock_unit_id: string
  current_qty: number
  is_active: boolean
}

interface BranchStockRow {
  inventory_item_id: string
  outlet_id: string | null
  current_qty: number
}

interface MenuItemRow {
  id: string
  name: string
  modifier_groups?: ModifierGroup[] | null
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
 */
function resolveShelf(
  ingredients: readonly IngredientRow[],
  units: ReadonlyMap<string, InventoryUnit>,
  branchStock: readonly BranchStockRow[],
  outletId: string | null,
): ProducibleStock[] {
  const branchQty = new Map<string, number>()
  if (outletId) {
    for (const row of branchStock) {
      if (row.outlet_id !== outletId) continue
      branchQty.set(row.inventory_item_id, Number(row.current_qty))
    }
  }

  const shelf: ProducibleStock[] = []
  for (const ingredient of ingredients) {
    const stockUnit = units.get(ingredient.stock_unit_id)
    // Nothing to convert against means nothing to judge with.
    if (!stockUnit) continue

    let onHand: number
    if (outletId) {
      const branch = branchQty.get(ingredient.id)
      if (branch === undefined) continue // Unjudgeable at this branch.
      onHand = branch
    } else {
      onHand = Number(ingredient.current_qty)
    }

    if (!Number.isFinite(onHand)) continue

    shelf.push({
      id: ingredient.id,
      current_qty: onHand,
      is_active: ingredient.is_active,
      stockUnit,
    })
  }

  return shelf
}

/**
 * Everything needed to answer "how many of this can the kitchen make?", or
 * `null` when there is no opinion to be had.
 */
export async function readTenantStockGraph(
  tenantId: string,
  outletId: string | null = null,
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
        paged('inventory_items', 'id, name, stock_unit_id, current_qty, is_active'),
        paged('inventory_units', 'id, name, abbreviation, dimension, to_base_factor'),
        paged('inventory_stock', 'id, inventory_item_id, outlet_id, current_qty'),
        paged('menu_items', 'id, name, modifier_groups'),
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
      recipes: (recipesResult.data ?? []) as unknown as Recipe[],
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
