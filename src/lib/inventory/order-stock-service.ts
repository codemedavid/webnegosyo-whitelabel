/**
 * Order-driven stock depletion.
 *
 * Stock lives in the platform Supabase for every tenant, whatever backend holds
 * their orders — Convex, their own Supabase project, or the shared platform DB.
 * All three converge in `createOrderAction`, so depletion hooks in once here and
 * serves all of them rather than being reimplemented per backend.
 *
 * Every write goes through the same append-only ledger a merchant uses by hand,
 * so an order's effect on stock is visible in the same history and reversible
 * by the same mechanism.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { InventoryItem, InventoryUnitRow, Recipe, RecipeComponent } from '@/types/database'
import {
  resolveOrderDepletions,
  type DepletionOrderItem,
} from '@/lib/inventory/order-depletion'
import { resolveMovementDelta } from '@/lib/inventory/stock-ledger'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

function toUnit(row: InventoryUnitRow): InventoryUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: row.to_base_factor,
  }
}

export interface OrderStockResult {
  /** Movements actually written. Zero is normal — most menus are partly costed. */
  movementCount: number
  /** Ingredients skipped because a unit could not be resolved. */
  skipped: string[]
}

const EMPTY_RESULT: OrderStockResult = { movementCount: 0, skipped: [] }

/**
 * Spend (`sale`) or return (`void`) an order's ingredients.
 *
 * Uses the service-role client deliberately: a customer placing an order has no
 * admin session, and inventory RLS is admin-only. Tenant scoping is enforced
 * here by filtering every read and write on `tenant_id`, and again by the
 * ledger trigger, which rejects a movement naming an item outside its tenant.
 */
export async function applyOrderStockMovements(
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void',
): Promise<OrderStockResult> {
  if (items.length === 0) return EMPTY_RESULT
  const supabase = createAdminClient()

  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))]
  const { data: recipeRows, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('menu_item_id', menuItemIds)
  if (recipeError) throw recipeError

  const recipes = (recipeRows ?? []) as unknown as Recipe[]
  if (recipes.length === 0) return EMPTY_RESULT

  const { data: componentRows, error: componentError } = await supabase
    .from('recipe_components')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('recipe_id', recipes.map((r) => r.id))
  if (componentError) throw componentError

  const depletions = resolveOrderDepletions(
    items,
    recipes,
    (componentRows ?? []) as unknown as RecipeComponent[],
  )
  if (depletions.length === 0) return EMPTY_RESULT

  const ingredientIds = [...new Set(depletions.map((d) => d.inventoryItemId))]
  const { data: itemRows, error: itemError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', ingredientIds)
  if (itemError) throw itemError
  const inventoryItems = (itemRows ?? []) as unknown as InventoryItem[]
  const itemById = new Map(inventoryItems.map((i) => [i.id, i]))

  const { data: unitRows, error: unitError } = await supabase
    .from('inventory_units')
    .select('*')
    .eq('tenant_id', tenantId)
  if (unitError) throw unitError
  const unitById = new Map(
    ((unitRows ?? []) as unknown as InventoryUnitRow[]).map((u) => [u.id, u]),
  )

  const skipped: string[] = []
  const rows: Record<string, unknown>[] = []

  for (const depletion of depletions) {
    const item = itemById.get(depletion.inventoryItemId)
    const enteredUnit = unitById.get(depletion.unitId)
    const stockUnit = item ? unitById.get(item.stock_unit_id) : undefined
    if (!item || !enteredUnit || !stockUnit) {
      skipped.push(depletion.inventoryItemId)
      continue
    }

    // Cross-dimension units throw; one bad recipe line must not sink the whole
    // order's depletion, so it is skipped and reported instead.
    let quantityDelta: number
    try {
      quantityDelta = resolveMovementDelta({
        reason: direction,
        quantity: depletion.quantity,
        unit: toUnit(enteredUnit),
        stockUnit: toUnit(stockUnit),
        currentQty: item.current_qty,
      })
    } catch {
      skipped.push(depletion.inventoryItemId)
      continue
    }

    rows.push({
      tenant_id: tenantId,
      inventory_item_id: depletion.inventoryItemId,
      reason: direction,
      quantity_delta: quantityDelta,
      entered_quantity: depletion.quantity,
      entered_unit_id: depletion.unitId,
      order_id: orderId,
    })
  }

  if (rows.length === 0) return { movementCount: 0, skipped }

  const { error: insertError } = await supabase.from('stock_movements').insert(rows as never)
  if (insertError) throw insertError

  return { movementCount: rows.length, skipped }
}

/**
 * Fire-and-forget depletion for the order-creation path.
 *
 * Never throws and never blocks: the order is already saved and paid for by the
 * time this runs. A stock system that can lose a customer's order is worse than
 * one whose numbers drift — the ledger is reconcilable, a lost order is not.
 */
export async function applyOrderStockBestEffort(
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void' = 'sale',
): Promise<void> {
  try {
    const result = await applyOrderStockMovements(tenantId, orderId, items, direction)
    if (result.skipped.length > 0) {
      console.warn('[inventory] Skipped stock movements for order', {
        orderId,
        skipped: result.skipped,
      })
    }
  } catch (error) {
    console.error('[inventory] Stock depletion failed for order', orderId, error)
  }
}
