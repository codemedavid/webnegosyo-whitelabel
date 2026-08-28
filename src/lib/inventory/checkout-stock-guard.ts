/**
 * The one decision checkout makes about whether the kitchen can fill a cart.
 *
 * `producible.ts` holds the arithmetic; this is the read that feeds it. It sits
 * beside the live Loyverse check in `createOrderAction` and answers the
 * question that check never could: not "is this dish above zero?" — which is
 * only ever true *after* an order has already emptied the shelf — but "can the
 * kitchen make the number in this cart?".
 *
 * Runs on the service-role client, like the rest of the order pipeline: a diner
 * has no session, and the rows this needs (recipes, ingredients) are not theirs
 * to read. Nothing from the request steers it beyond the tenant, the branch the
 * order is already being placed against, and the lines being bought.
 *
 * SILENCE IS THE DEFAULT. Inventory off, a failed read, an empty cart, a dish
 * with no recipe, an ingredient with no row at this branch — every one of those
 * returns "no opinion" rather than a refusal. A wrongly refused order costs a
 * real sale and a customer who does not come back; a wrongly accepted one costs
 * an apology and a merchant who already knew their shelf was thin.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  findCartStockShortfalls,
  describeStockShortfalls,
  type CartStockLine,
  type ProducibleStock,
} from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

/** No opinion. Every failure path returns this. */
const NO_OPINION = ''

interface IngredientRow {
  id: string
  name: string
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
}

/**
 * The shelf as the branch placing this order sees it.
 *
 * A store-wide order gets `inventory_items.current_qty`, which is already the
 * roll-up across every branch. A branch order gets its own `inventory_stock`
 * row — and an ingredient with NO row at that branch is DROPPED, not zeroed.
 *
 * That is deliberately the opposite of what the admin screens do. There, a
 * missing row means zero, because an owner looking at a branch needs to see
 * what is really there. Here the number decides whether a paying customer is
 * turned away, and "this branch never set up per-branch stock for flour" is
 * ignorance, not an empty shelf. Refusing on ignorance is how a merchant
 * discovers this feature by losing a day of orders.
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
    // An ingredient whose unit is missing cannot be converted against, so it
    // cannot be judged either.
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
 * The message to refuse a cart with, or `''` when there is nothing to say.
 *
 * @param outletId the branch the order is being placed against, if any. It
 *   comes from the order being built, never from the customer's payload.
 */
export async function findCheckoutStockShortfallMessage(
  tenantId: string,
  lines: readonly CartStockLine[],
  outletId: string | null = null,
): Promise<string> {
  if (lines.length === 0) return NO_OPINION

  try {
    const supabase = createAdminClient()

    // The gate comes first and alone: a tenant who has not switched inventory
    // on must pay for none of the reads below.
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('inventory_enabled')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantError) return NO_OPINION
    if ((tenant as { inventory_enabled?: boolean | null } | null)?.inventory_enabled !== true) {
      return NO_OPINION
    }

    const [recipesResult, componentsResult, itemsResult, unitsResult, stockResult, menuResult] =
      await Promise.all([
        supabase
          .from('recipes')
          .select('id, target_type, menu_item_id')
          .eq('tenant_id', tenantId),
        supabase
          .from('recipe_components')
          .select('recipe_id, inventory_item_id, quantity, unit_id')
          .eq('tenant_id', tenantId),
        supabase
          .from('inventory_items')
          .select('id, name, stock_unit_id, current_qty, is_active')
          .eq('tenant_id', tenantId),
        supabase
          .from('inventory_units')
          .select('id, name, abbreviation, dimension, to_base_factor')
          .eq('tenant_id', tenantId),
        supabase
          .from('inventory_stock')
          .select('inventory_item_id, outlet_id, current_qty')
          .eq('tenant_id', tenantId),
        supabase
          .from('menu_items')
          .select('id, name')
          .eq('tenant_id', tenantId),
      ])

    // A PostgREST error arrives as `error`, not as a throw, so without this the
    // reads below would read as "this tenant has no recipes" and wave the cart
    // through — silently, and only for tenants whose database was struggling.
    const failure =
      recipesResult.error ??
      componentsResult.error ??
      itemsResult.error ??
      unitsResult.error ??
      stockResult.error ??
      menuResult.error
    if (failure) {
      console.error('[inventory] Checkout stock guard read failed', tenantId, failure)
      return NO_OPINION
    }

    const units = new Map<string, InventoryUnit>(
      ((unitsResult.data ?? []) as unknown as InventoryUnit[]).map((unit) => [unit.id, unit]),
    )

    const shelf = resolveShelf(
      (itemsResult.data ?? []) as unknown as IngredientRow[],
      units,
      (stockResult.data ?? []) as unknown as BranchStockRow[],
      outletId,
    )

    const shortfalls = findCartStockShortfalls(
      lines,
      (recipesResult.data ?? []) as unknown as Recipe[],
      (componentsResult.data ?? []) as unknown as RecipeComponent[],
      shelf,
      [...units.values()],
    )

    if (shortfalls.length === 0) return NO_OPINION

    const names = new Map<string, string>(
      ((menuResult.data ?? []) as unknown as MenuItemRow[]).map((item) => [item.id, item.name]),
    )

    return describeStockShortfalls(shortfalls, names)
  } catch (error) {
    // Same reasoning as every other stock path: the guard's own failure must
    // never be the reason a merchant cannot take an order.
    console.error('[inventory] Checkout stock guard failed', tenantId, error)
    return NO_OPINION
  }
}
