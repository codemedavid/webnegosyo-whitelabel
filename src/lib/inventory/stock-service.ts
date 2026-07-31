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
import {
  convertQuantity,
  convertUnitCost,
  type InventoryUnit,
} from '@/lib/inventory/unit-conversion'
import { resolveMovementBranch } from '@/lib/inventory/branch-stock-view'
import {
  resolveBranchScope,
  type BranchScope,
  type BranchScopedUser,
} from '@/lib/outlets/branch-scope'

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

/** Alerting must never unwind a movement the merchant already recorded. */
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

/**
 * Any Supabase client already scoped to the caller — the cookie-bound server
 * client on the web, a Bearer-token client for the merchant app.
 */
type StockMovementClient = Awaited<ReturnType<typeof createClient>>

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
  const supabase = await createClient()
  return recordStockMovementWith(supabase, tenantId, input)
}

/**
 * The movement itself, against a caller-supplied client.
 *
 * Split out for the merchant app, which arrives with a Bearer token and no
 * cookies, so it can neither use the cookie-bound server client nor
 * `verifyTenantPermission` — it authorizes itself at the route and hands the
 * resulting client in here.
 *
 * Sharing this body is the point. RLS would let the app insert into
 * `stock_movements` directly, but the signed delta, the moving-average cost and
 * the alert/auto-86 pass all live here; a direct insert would skip two of them
 * and resolve the third from a figure the phone happened to be holding.
 *
 * Authorization is the caller's responsibility and must already have happened.
 */
/**
 * Who is entering this movement, or `null` if nobody can be named.
 *
 * The daily report can say ₱500 of beef went missing on Tuesday; without this
 * nothing says who counted the shelf that day, and shrinkage is only
 * actionable against a person and a time.
 *
 * Never throws. Attribution is secondary to the count itself: refusing to
 * record a stocktake because the identity lookup failed would leave a wrong
 * quantity on the shelf, which is worse than an unattributed row. A service
 * client — the order pipeline's — legitimately has no user, and a `sale` is
 * deducted by the system rather than by a person, so anonymous is the correct
 * answer there rather than a fallback.
 */
async function resolveActingUserId(supabase: StockMovementClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) return null
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * The branch scope of whoever is recording this movement.
 *
 * Resolved from `app_users` rather than taken from the caller, for the same
 * reason the POS route resolves it server-side: a client-named branch on a
 * write path would let one shop move another's stock.
 *
 * Falls back to store-wide when no user can be named. That is the order
 * pipeline's service client — a `sale` is deducted by the system, not by a
 * person — and it is the behaviour every tenant has today.
 */
async function resolveActingBranchScope(
  supabase: StockMovementClient,
  tenantId: string,
): Promise<BranchScope> {
  try {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return { kind: 'all' }

    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, is_owner, outlet_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()
    if (!appUser) return { kind: 'all' }

    return resolveBranchScope(appUser as unknown as BranchScopedUser)
  } catch {
    return { kind: 'all' }
  }
}

export async function recordStockMovementWith(
  supabase: StockMovementClient,
  tenantId: string,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  const validated = stockMovementInputSchema.parse(input)

  // Throws for a manager naming somebody else's shop, before anything is read
  // or written — a refused movement must leave no trace.
  const outletId = resolveMovementBranch(
    validated.outlet_id,
    await resolveActingBranchScope(supabase, tenantId),
  )

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

  // The count itself, converted to the stock unit — an absolute, so unlike
  // `quantityDelta` it does not depend on when it was read.
  const countedInStockUnit = convertQuantity(
    validated.quantity,
    toUnit(enteredUnit),
    toUnit(stockUnit),
  )

  // The merchant prices a delivery in the unit they buy in (P120 per kg) but
  // `unit_cost` is per STOCK unit, because every figure that consumes it — the
  // moving average, recipe cost, and the report's COGS — pairs it with a
  // quantity already converted to stock units. Storing the typed price verbatim
  // was the 1000x defect: it looks correct on the receiving screen and only
  // surfaces three screens away as an impossible food cost.
  const unitCostInStockUnit =
    validated.unit_cost === undefined
      ? undefined
      : convertUnitCost(validated.unit_cost, toUnit(enteredUnit), toUnit(stockUnit))

  const { data: movementRow, error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      created_by: await resolveActingUserId(supabase),
      tenant_id: tenantId,
      inventory_item_id: validated.inventory_item_id,
      outlet_id: outletId,
      reason: validated.reason,
      quantity_delta: quantityDelta,
      // A stocktake states WHAT WAS COUNTED and lets the trigger subtract,
      // under the row lock, from the figure the update is about to change.
      // Computing the difference here uses `item.current_qty` read earlier in
      // this request, so anything landing in that gap is absorbed silently: a
      // probe counted 900, a sale of 50 arrived mid-flight, and the shelf ended
      // at 850 — the one movement whose whole purpose is to be authoritative,
      // quietly wrong. `quantity_delta` above is still sent and is what an
      // un-migrated database will use; the trigger overwrites it.
      //
      // Only a stocktake may carry a target. A delivery is a RELATIVE movement:
      // letting it state an absolute would make two deliveries in a row
      // overwrite each other instead of accumulating.
      target_qty: validated.reason === 'stocktake' ? countedInStockUnit : null,
      entered_quantity: validated.quantity,
      entered_unit_id: validated.unit_id,
      unit_cost: unitCostInStockUnit ?? null,
      note: validated.note ?? null,
      order_id: validated.order_id ?? null,
    } as never)
    .select()
    .single()
  if (movementError) throw movementError
  const movement = movementRow as unknown as StockMovement

  // A delivery at a new price blends into the cost of stock already on hand.
  // Only when a price was actually supplied — see `stockMovementInputSchema`.
  if (validated.reason === 'receive' && unitCostInStockUnit !== undefined) {
    // Every term here is per stock unit: the shelf's existing cost, the
    // delivery's converted price, and both quantities. Mixing units in a
    // weighted average silently biases the blend rather than failing.
    const blended = movingAverageUnitCost({
      currentQty: item.current_qty,
      currentUnitCost: item.unit_cost,
      receivedQty: quantityDelta,
      receivedUnitCost: unitCostInStockUnit,
    })
    const { error: costError } = await supabase
      .from('inventory_items')
      .update({ unit_cost: blended } as never)
      .eq('id', item.id)
      .eq('tenant_id', tenantId)
    if (costError) throw costError
  }

  // A merchant wasting the last of an ingredient crosses the same line an order
  // does, so the alert path hangs off both writers. It reads the item as it
  // stood before the movement, paired with the delta just applied.
  await notifyStockLevelChanges(tenantId, [item], new Map([[item.id, quantityDelta]]))

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
