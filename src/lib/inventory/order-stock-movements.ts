/**
 * The two claimed ledger operations an order's stock is built from: spend or
 * return an order's lines (`applyOrderStockMovements`), and reverse everything
 * an order recorded (`reverseOrderStockMovements`).
 *
 * Uses the service-role client deliberately: a customer placing an order has no
 * admin session, and inventory RLS is admin-only. Tenant scoping is enforced
 * here by filtering every read and write on `tenant_id`, and again by the
 * ledger trigger, which rejects a movement naming an item outside its tenant.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { InventoryItem, InventoryUnitRow, Recipe, RecipeComponent } from '@/types/database'
import { expandLinkedStockItems, linkedStockMenuItemIds, selectedStockOptionIds, type StockOptionCatalogItem } from './option-stock'
import { resolveOrderDepletions, type DepletionOrderItem, type StockDepletion } from './order-depletion'
import { resolveMovementDelta } from './stock-ledger'
import { resolveMovementOutletId } from './stock-location'
import { reportStockFailure } from './stock-failure-report'
import {
  claimOrderStockApplication,
  releaseOrderStockApplication,
  listOrderStockClaims,
  resolveVoidClaimRevision,
  hasBlockingVoidClaim,
  isCancelledByClaims,
  recordRestoredMovements,
  type OrderStockClaimKind,
  type RestoredMovement,
} from './order-stock-claim'
import {
  EMPTY_RESULT,
  unwritten,
  toUnit,
  applySimpleOptionStockIsolated,
  writeOrderLedgerRows,
  type AdminClient,
  type OrderLedgerRow,
  type OrderStockResult,
} from './order-stock-ledger'

/**
 * Spend (`sale`) or return (`void`) an order's ingredients.
 */
export async function applyOrderStockMovements(
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void',
  /**
   * Which revision of the order this movement belongs to. 0 is the original
   * sale; a saved edit passes its own, so it can move stock on an order that
   * already claimed both directions. See migration 20260806130000.
   */
  revision: number = 0,
  /**
   * Branch that took the order, whose stock this spends. Null/blank means the
   * unbranched store pool — which is every single-location tenant, and every
   * order taken before branches existed.
   */
  outletId: string | null = null,
  /**
   * Which claim namespace this movement belongs to: the order's own life
   * (sale, un-cancel) or a saved edit's difference. See `OrderStockClaimKind`.
   */
  kind: OrderStockClaimKind = 'order',
): Promise<OrderStockResult> {
  if (items.length === 0) return EMPTY_RESULT
  const supabase = createAdminClient()
  const movementOutletId = resolveMovementOutletId(outletId)

  // The option RPC has its own transaction/claim. Run it even on a retried
  // ingredient claim, so either independently failed stock path can recover.
  const simpleMovementCount = await applySimpleOptionStockIsolated(supabase, tenantId, orderId, direction, revision, items, movementOutletId)

  // Idempotency. The order-creation path is retryable, and depleting twice
  // would take stock down twice for one sale with two ledger rows each claiming
  // to be the truth. The claim is a unique-indexed row, so the database refuses
  // the second caller — a SELECT-then-INSERT here let every racing call through.
  if (!(await claimOrderStockApplication(supabase, tenantId, orderId, direction, revision, kind))) {
    return unwritten('duplicate', simpleMovementCount)
  }
  const release = () => releaseOrderStockApplication(supabase, tenantId, orderId, direction, revision, kind)

  // Every exit between the claim and the ledger write has to hand the claim
  // back. A claim that outlives a depletion which never happened marks the
  // order permanently done with its stock still on the shelf — the failure mode
  // is silent, and worse than the double-deduction the claim exists to stop.
  try {
    if (await isRefusedByCancellation(supabase, tenantId, orderId, direction, revision, kind)) {
      await release()
      return unwritten('cancelled_first')
    }

    const result = await depleteClaimedOrder(supabase, tenantId, orderId, items, direction, movementOutletId)
    if (result.movementCount === 0) await release()
    return { ...result, movementCount: result.movementCount + simpleMovementCount }
  } catch (error) {
    await release()
    throw error
  }
}

/**
 * Cancel wins. Depletion is fire-and-forget, so a fast cancellation can take
 * its void claim before the sale's rows land. The reverse keeps that claim even
 * when it found nothing to reverse — it is this guard — so a sale arriving
 * afterwards must stand down, hand its claim back, and leave the cancelled
 * order with no stock moved in either direction.
 *
 * An edit stands down the same way once the order is cancelled: the
 * cancellation already netted everything recorded, so a late edit would spend
 * for a dead order or give back stock that was never out.
 */
async function isRefusedByCancellation(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  direction: 'sale' | 'void',
  revision: number,
  kind: OrderStockClaimKind,
): Promise<boolean> {
  if (direction !== 'sale' && kind !== 'edit') return false
  const claims = await listOrderStockClaims(supabase, tenantId, orderId)
  return kind === 'edit' ? isCancelledByClaims(claims) : hasBlockingVoidClaim(claims, revision)
}

interface RecipeGraph {
  catalog: StockOptionCatalogItem[]
  recipes: Recipe[]
  components: RecipeComponent[]
}

/** The recipes (and option-linked recipes) an order's lines can spend. */
async function readRecipeGraph(
  supabase: AdminClient,
  tenantId: string,
  items: readonly DepletionOrderItem[],
): Promise<RecipeGraph> {
  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))]
  let catalog: StockOptionCatalogItem[] = []
  if (items.some((item) => selectedStockOptionIds(item).length > 0)) {
    const { data, error } = await supabase.from('menu_items').select('id, modifier_groups').eq('tenant_id', tenantId).in('id', menuItemIds)
    if (error) throw error
    catalog = (data ?? []) as unknown as StockOptionCatalogItem[]
  }

  const recipeMenuItemIds = [...new Set([...menuItemIds, ...linkedStockMenuItemIds(catalog)])]
  const { data: recipeRows, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('menu_item_id', recipeMenuItemIds)
  if (recipeError) throw recipeError
  const recipes = (recipeRows ?? []) as unknown as Recipe[]
  if (recipes.length === 0) return { catalog, recipes, components: [] }

  const { data: componentRows, error: componentError } = await supabase
    .from('recipe_components')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('recipe_id', recipes.map((r) => r.id))
  if (componentError) throw componentError
  return { catalog, recipes, components: (componentRows ?? []) as unknown as RecipeComponent[] }
}

interface IngredientContext {
  itemById: ReadonlyMap<string, InventoryItem>
  unitById: ReadonlyMap<string, InventoryUnitRow>
}

/** The ingredients and units the depletions name, all tenant-scoped. */
async function readIngredientContext(
  supabase: AdminClient,
  tenantId: string,
  depletions: readonly StockDepletion[],
): Promise<IngredientContext & { inventoryItems: InventoryItem[] }> {
  const ingredientIds = [...new Set(depletions.map((d) => d.inventoryItemId))]
  const { data: itemRows, error: itemError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', ingredientIds)
  if (itemError) throw itemError
  const inventoryItems = (itemRows ?? []) as unknown as InventoryItem[]

  const { data: unitRows, error: unitError } = await supabase
    .from('inventory_units')
    .select('*')
    .eq('tenant_id', tenantId)
  if (unitError) throw unitError

  return {
    inventoryItems,
    itemById: new Map(inventoryItems.map((i) => [i.id, i])),
    unitById: new Map(((unitRows ?? []) as unknown as InventoryUnitRow[]).map((u) => [u.id, u])),
  }
}

/**
 * The ledger rows for a set of depletions. Pieces against weight/volume throw;
 * one bad recipe line must not sink the whole order's depletion, so it is
 * skipped and reported instead.
 */
function buildDepletionRows(
  depletions: readonly StockDepletion[],
  context: IngredientContext,
  target: { tenantId: string; orderId: string; direction: 'sale' | 'void'; outletId: string | null },
): { rows: OrderLedgerRow[]; skipped: string[] } {
  const rows: OrderLedgerRow[] = []
  const skipped: string[] = []

  for (const depletion of depletions) {
    const item = context.itemById.get(depletion.inventoryItemId)
    const enteredUnit = context.unitById.get(depletion.unitId)
    const stockUnit = item ? context.unitById.get(item.stock_unit_id) : undefined
    if (!item || !enteredUnit || !stockUnit) {
      skipped.push(depletion.inventoryItemId)
      continue
    }

    let quantityDelta: number
    try {
      quantityDelta = resolveMovementDelta({
        reason: target.direction,
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
      tenant_id: target.tenantId,
      inventory_item_id: depletion.inventoryItemId,
      outlet_id: target.outletId,
      reason: target.direction,
      quantity_delta: quantityDelta,
      entered_quantity: depletion.quantity,
      entered_unit_id: depletion.unitId,
      order_id: target.orderId,
    })
  }
  return { rows, skipped }
}

/**
 * The depletion itself, once this caller owns the claim.
 *
 * Split out so the claim's release has exactly one place to live: this body has
 * several exits and a caller that forgot one of them would leak a claim.
 */
async function depleteClaimedOrder(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void',
  outletId: string | null,
): Promise<OrderStockResult> {
  const graph = await readRecipeGraph(supabase, tenantId, items)
  if (graph.recipes.length === 0) return EMPTY_RESULT

  const depletions = resolveOrderDepletions(
    expandLinkedStockItems(items, graph.catalog, graph.recipes),
    graph.recipes,
    graph.components,
  )
  if (depletions.length === 0) return EMPTY_RESULT

  const context = await readIngredientContext(supabase, tenantId, depletions)
  const { rows, skipped } = buildDepletionRows(depletions, context, { tenantId, orderId, direction, outletId })
  if (rows.length === 0) return { ...EMPTY_RESULT, skipped }

  const result = await writeOrderLedgerRows(supabase, tenantId, rows, context.inventoryItems)
  return { ...result, skipped }
}

interface RecordedMovement {
  inventory_item_id: string
  outlet_id: string | null
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
}

/**
 * The reversal of everything an order recorded, netted per ingredient AND
 * entered unit AND branch.
 *
 * The unit keeps the audit value coherent: the same ingredient can be recorded
 * in grams by a base recipe and kilograms by an addon, and summing those into
 * one `entered_quantity` would print a number that means nothing.
 *
 * The BRANCH keeps the stock in the right shop. An order that spent flour at
 * two branches — or whose branch was corrected mid-life — nets to one row
 * without it, and that row would take stock out of one pool and give it back to
 * another, leaving the branch that actually spent it permanently short. The
 * branch is read off the recorded movement rather than re-resolved from the
 * order, so a sale and its reversal cannot disagree by construction.
 */
export function buildReversalRows(
  tenantId: string,
  orderId: string,
  movements: readonly RecordedMovement[],
): OrderLedgerRow[] {
  const netted = new Map<string, { movement: RecordedMovement; delta: number; entered: number }>()

  for (const movement of movements) {
    const key = `${movement.inventory_item_id}|${movement.entered_unit_id ?? ''}|${movement.outlet_id ?? ''}`
    const existing = netted.get(key)
    // `entered_quantity` is stored unsigned — the reason carries the direction —
    // so it has to be signed by its own movement before it can be netted.
    // Summing the raw magnitudes would report 800 g entered for a 400 g net.
    const enteredSigned = (movement.entered_quantity ?? 0) * Math.sign(movement.quantity_delta)
    netted.set(key, {
      movement,
      delta: (existing?.delta ?? 0) + movement.quantity_delta,
      entered: (existing?.entered ?? 0) + enteredSigned,
    })
  }

  return [...netted.values()]
    // An ingredient an edit already returned in full has nothing left to give
    // back, and a zero-delta ledger row reads as a real event that never was.
    .filter((entry) => entry.delta !== 0)
    .map(({ movement, delta, entered }) => ({
      tenant_id: tenantId,
      inventory_item_id: movement.inventory_item_id,
      outlet_id: movement.outlet_id ?? null,
      reason: 'void' as const,
      quantity_delta: -delta,
      // Carried across so the reversal reads "0.6 kg returned", matching the
      // sale's audit trail rather than showing a bare converted number.
      entered_quantity: entered === 0 ? null : Math.abs(entered),
      entered_unit_id: movement.entered_unit_id,
      order_id: orderId,
    }))
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
  const simpleMovementCount = await applySimpleOptionStockIsolated(supabase, tenantId, orderId, 'cancel')
  const simpleResult = unwritten('nothing_to_deduct', simpleMovementCount)

  // The void claim is taken at a revision that pairs with the order's latest
  // sale, skipping any void an edit already burned — so a cancellation works
  // on an edited order, and a second cancel after an un-cancel claims fresh.
  const claims = await listOrderStockClaims(supabase, tenantId, orderId)
  const voidRevision = resolveVoidClaimRevision(claims)

  // Claim BEFORE reading movements — cancelling twice would put the stock back
  // twice, and the database refusing the second caller is the guard. Claiming
  // first also closes the race against the fire-and-forget depletion: a sale
  // landing after this claim is seen by the read below and reversed, and a
  // sale that has not landed yet finds this claim and stands down.
  if (!(await claimOrderStockApplication(supabase, tenantId, orderId, 'void', voidRevision))) {
    return unwritten('duplicate', simpleMovementCount)
  }
  // A claim outliving a reversal that never wrote would leave the order
  // permanently un-restorable, its ingredients still counted as sold.
  const release = () => releaseOrderStockApplication(supabase, tenantId, orderId, 'void', voidRevision)

  // EVERY movement this order recorded, not just its sale: an edit that
  // removes an item writes a `void` correction while the order is still live,
  // so reversing the sale rows alone would give back stock already given back.
  const { data: movementRows, error: movementError } = await supabase
    .from('stock_movements')
    .select('inventory_item_id, outlet_id, quantity_delta, entered_quantity, entered_unit_id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (movementError) {
    await release()
    throw movementError
  }

  // Nothing recorded (yet), or nothing left to give back. The claim is
  // deliberately KEPT: it is the marker the sale path checks, so a depletion
  // racing this cancellation no-ops instead of spending stock for an order that
  // no longer exists.
  const rows = buildReversalRows(tenantId, orderId, (movementRows ?? []) as unknown as RecordedMovement[])
  if (rows.length === 0) return simpleResult

  let result: OrderStockResult
  try {
    result = await writeOrderLedgerRows(supabase, tenantId, rows)
  } catch (error) {
    await release()
    throw error
  }

  await rememberRestored(supabase, tenantId, orderId, voidRevision, rows)
  return { ...result, movementCount: result.movementCount + simpleMovementCount }
}

/**
 * Remember exactly what came back, so an un-cancel re-spends precisely this
 * (option and add-on recipes included) instead of recomputing from order lines
 * that carry no option ids. Losing the record only costs that precision — the
 * un-cancel falls back to recomputing — so it never fails the reversal that
 * already landed.
 */
async function rememberRestored(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  voidRevision: number,
  rows: readonly OrderLedgerRow[],
): Promise<void> {
  const restored: RestoredMovement[] = rows.map((row) => ({
    inventory_item_id: row.inventory_item_id,
    outlet_id: row.outlet_id,
    quantity_delta: row.quantity_delta,
    entered_quantity: row.entered_quantity,
    entered_unit_id: row.entered_unit_id,
  }))
  try {
    await recordRestoredMovements(supabase, tenantId, orderId, voidRevision, restored)
  } catch (error) {
    reportStockFailure({ tenantId, orderId, operation: 'record_restored_movements', revision: voidRevision }, error)
  }
}
