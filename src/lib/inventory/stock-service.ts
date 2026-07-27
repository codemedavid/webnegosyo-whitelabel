/**
 * Server-side service for the stock movement ledger.
 *
 * The ledger is append-only and `inventory_items.current_qty` is a running
 * total maintained by a database trigger (migration 20260726120000). Nothing
 * here writes `current_qty` directly — the trigger applies the delta inside the
 * insert, so two concurrent movements serialize on the item row instead of
 * racing through a read-modify-write here.
 *
 * The client sends a magnitude and a reason; the *signed* delta is resolved
 * here against the quantity read in this request, never a figure the client
 * happened to be holding.
 */

import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { InventoryItem, InventoryUnitRow, StockMovement } from '@/types/database'
import {
  stockMovementInputSchema,
  type StockMovementInput,
} from '@/lib/inventory/schemas'
import {
  resolveMovementDelta,
  movingAverageUnitCost,
} from '@/lib/inventory/stock-ledger'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

export { stockMovementInputSchema, type StockMovementInput }

function toUnit(row: InventoryUnitRow): InventoryUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: row.to_base_factor,
  }
}

export interface StockMovementResult {
  movement: StockMovement
  /** The item as it stands after the movement, for the caller to display. */
  item: InventoryItem
}

/** Recent movements for one ingredient, newest first. */
export async function getStockMovements(
  tenantId: string,
  inventoryItemId: string,
  limit = 20,
): Promise<StockMovement[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('inventory_item_id', inventoryItemId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as StockMovement[]
}

/**
 * Append one movement to the ledger. Returns the movement and the item as it
 * stands afterwards, so the caller displays the server's figure rather than
 * guessing at the new total.
 */
export async function recordStockMovement(
  tenantId: string,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  await verifyTenantPermission(tenantId, 'menu')
  const validated = stockMovementInputSchema.parse(input)
  const supabase = await createClient()

  const { data: itemRow, error: itemError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', validated.inventory_item_id)
    .single()
  if (itemError) throw itemError
  const item = itemRow as unknown as InventoryItem

  const { data: unitRows, error: unitError } = await supabase
    .from('inventory_units')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', [validated.unit_id, item.stock_unit_id])
  if (unitError) throw unitError

  const units = (unitRows ?? []) as unknown as InventoryUnitRow[]
  const enteredUnit = units.find((u) => u.id === validated.unit_id)
  const stockUnit = units.find((u) => u.id === item.stock_unit_id)
  if (!enteredUnit || !stockUnit) {
    throw new Error('The movement unit could not be resolved for this ingredient')
  }

  // Throws on a cross-dimension unit rather than inventing a conversion.
  const quantityDelta = resolveMovementDelta({
    reason: validated.reason,
    quantity: validated.quantity,
    unit: toUnit(enteredUnit),
    stockUnit: toUnit(stockUnit),
    currentQty: item.current_qty,
  })

  const { data: movementRow, error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      tenant_id: tenantId,
      inventory_item_id: validated.inventory_item_id,
      reason: validated.reason,
      quantity_delta: quantityDelta,
      entered_quantity: validated.quantity,
      entered_unit_id: validated.unit_id,
      unit_cost: validated.unit_cost ?? null,
      note: validated.note ?? null,
      order_id: validated.order_id ?? null,
    } as never)
    .select()
    .single()
  if (movementError) throw movementError
  const movement = movementRow as unknown as StockMovement

  // A delivery at a new price blends into the cost of stock already on hand.
  // Only when a price was actually supplied — see `stockMovementInputSchema`.
  if (validated.reason === 'receive' && validated.unit_cost !== undefined) {
    const blended = movingAverageUnitCost({
      currentQty: item.current_qty,
      currentUnitCost: item.unit_cost,
      receivedQty: quantityDelta,
      receivedUnitCost: validated.unit_cost,
    })
    const { error: costError } = await supabase
      .from('inventory_items')
      .update({ unit_cost: blended } as never)
      .eq('id', item.id)
      .eq('tenant_id', tenantId)
    if (costError) throw costError
  }

  const { data: updatedRow, error: refreshError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', validated.inventory_item_id)
    .single()
  if (refreshError) throw refreshError

  return { movement, item: updatedRow as unknown as InventoryItem }
}

/**
 * Put a cancelled order's ingredients back on the shelf, for callers that
 * cancel an order outside `updateOrderStatus`.
 *
 * The web admin cancels a Convex-held order straight through the Convex
 * mutation (see `convex-order-sheet.tsx`), so it never reaches the platform
 * order path where stock is restored. Without this, the same cancellation
 * returned stock from the merchant app but not from the web console.
 *
 * Authorization is checked here and deliberately BEFORE the reversal: the
 * reversal writes to a tenant's ledger, so a check that ran afterwards would
 * already have leaked. The reversal itself is best-effort — a stock write must
 * never make an order un-cancellable.
 */
export async function restoreOrderStock(
  tenantId: string,
  orderId: string,
): Promise<void> {
  await verifyTenantPermission(tenantId, 'orders')
  const { reverseOrderStockBestEffort } = await import(
    '@/lib/inventory/order-stock-service'
  )
  await reverseOrderStockBestEffort(tenantId, orderId)
}
