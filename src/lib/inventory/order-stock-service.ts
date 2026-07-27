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

/**
 * Runs the alert path without letting it affect the movement that triggered it.
 * `processStockLevelChanges` already swallows its own errors; this guards the
 * call itself, so a broken alert module can never unwind a recorded sale.
 */
async function notifyStockLevelChanges(
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
): Promise<void> {
  try {
    const { processStockLevelChanges } = await import('@/lib/inventory/stock-alerts-service')
    await processStockLevelChanges(tenantId, items, deltas)
  } catch (error) {
    console.error('[inventory] Stock level alerting failed', tenantId, error)
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

  // Idempotency. The order-creation path is retryable, and depleting twice
  // would take stock down twice for one sale with two ledger rows each claiming
  // to be the truth. Keyed on direction as well as order, so an order that was
  // sold and then voided stays independently correct in both directions.
  const { data: existing, error: existingError } = await supabase
    .from('stock_movements')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('reason', direction)
    .limit(1)
  if (existingError) throw existingError
  if (existing && existing.length > 0) {
    console.warn('[inventory] Stock movements already recorded for order', { orderId, direction })
    return EMPTY_RESULT
  }

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

  // Alerts read the PRE-movement rows plus the deltas just applied. Re-reading
  // the items instead would race the running-total trigger and could compare a
  // quantity against itself, detecting no crossing at all.
  const deltas = new Map<string, number>()
  for (const row of rows) {
    const itemId = row.inventory_item_id as string
    deltas.set(itemId, (deltas.get(itemId) ?? 0) + (row.quantity_delta as number))
  }
  await notifyStockLevelChanges(tenantId, inventoryItems, deltas)

  return { movementCount: rows.length, skipped }
}

/**
 * Put a cancelled order's ingredients back by reversing exactly what its sale
 * recorded.
 *
 * Deliberately does NOT recompute from the order's lines. Recomputing was a
 * drift bug waiting to happen: once depletion accounts for an option's
 * ingredients, a recomputed restore that missed them would leave stock
 * permanently short. Deriving the reversal from the sale makes the two
 * impossible to disagree.
 */
export async function reverseOrderStockMovements(
  tenantId: string,
  orderId: string,
): Promise<OrderStockResult> {
  const supabase = createAdminClient()

  const { data: saleRows, error: saleError } = await supabase
    .from('stock_movements')
    .select('inventory_item_id, quantity_delta, entered_quantity, entered_unit_id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('reason', 'sale')
  if (saleError) throw saleError

  const sales = (saleRows ?? []) as unknown as Array<{
    inventory_item_id: string
    quantity_delta: number
    entered_quantity: number | null
    entered_unit_id: string | null
  }>
  if (sales.length === 0) return EMPTY_RESULT

  const { data: existing, error: existingError } = await supabase
    .from('stock_movements')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('reason', 'void')
    .limit(1)
  if (existingError) throw existingError
  if (existing && existing.length > 0) {
    console.warn('[inventory] Order already restored', { orderId })
    return EMPTY_RESULT
  }

  const rows = sales.map((sale) => ({
    tenant_id: tenantId,
    inventory_item_id: sale.inventory_item_id,
    reason: 'void' as const,
    quantity_delta: -sale.quantity_delta,
    // Carried across so the reversal reads "0.6 kg returned", matching the
    // sale's audit trail rather than showing a bare converted number.
    entered_quantity: sale.entered_quantity,
    entered_unit_id: sale.entered_unit_id,
    order_id: orderId,
  }))

  const { error: insertError } = await supabase.from('stock_movements').insert(rows as never)
  if (insertError) throw insertError

  return { movementCount: rows.length, skipped: [] }
}

/** Never throws: a stock write must not make an order un-cancellable. */
export async function reverseOrderStockBestEffort(
  tenantId: string,
  orderId: string,
): Promise<void> {
  try {
    await reverseOrderStockMovements(tenantId, orderId)
  } catch (error) {
    console.error('[inventory] Failed to restore stock for order', orderId, error)
  }
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
