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
import {
  listOrderStockClaims,
  resolveVoidClaimRevision,
  type OrderStockClaimKind,
} from './order-stock-claim'
import {
  EMPTY_RESULT,
  unwritten,
  toUnit,
  applySimpleOptionStockIsolated,
  commitOrderLedgerRows,
  commitOrderLedgerReversal,
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
  const simple = await applySimpleOptionStockIsolated(supabase, tenantId, orderId, direction, revision, items, movementOutletId)
  const withSimple = (result: OrderStockResult): OrderStockResult => ({
    ...result,
    movementCount: result.movementCount + simple.count,
    ...(simple.shortfalls.length > 0 ? { shortfalls: simple.shortfalls } : {}),
  })

  // The rows are computed first, then claimed and written in ONE transaction
  // (`apply_order_stock_claim`): the database refuses a second caller
  // (`duplicate`), and refuses a sale its cancellation beat, or an edit of a
  // cancelled order (`cancelled_first`), under a per-order lock. Nothing to
  // deduct takes no claim, so a later retry (recipes added, a sweep) can.
  const built = await buildOrderLedgerRows(supabase, tenantId, orderId, items, direction, movementOutletId)
  if (built.rows.length === 0) return withSimple({ ...EMPTY_RESULT, skipped: built.skipped })

  const result = await commitOrderLedgerRows(
    supabase,
    { tenantId, orderId, reason: direction, kind, revision },
    built.rows,
    built.inventoryItems,
  )
  if (result.outcome === 'cancelled_first') return { ...result, skipped: built.skipped }
  return withSimple({ ...result, skipped: built.skipped })
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

interface BuiltOrderLedger {
  rows: OrderLedgerRow[]
  skipped: string[]
  /** PRE-movement ingredient rows, for the alert path. */
  inventoryItems: InventoryItem[]
}

/** The ledger rows an order's lines spend (or return), computed before any claim. */
async function buildOrderLedgerRows(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void',
  outletId: string | null,
): Promise<BuiltOrderLedger> {
  const none: BuiltOrderLedger = { rows: [], skipped: [], inventoryItems: [] }
  const graph = await readRecipeGraph(supabase, tenantId, items)
  if (graph.recipes.length === 0) return none

  const depletions = resolveOrderDepletions(
    expandLinkedStockItems(items, graph.catalog, graph.recipes),
    graph.recipes,
    graph.components,
  )
  if (depletions.length === 0) return none

  const context = await readIngredientContext(supabase, tenantId, depletions)
  const { rows, skipped } = buildDepletionRows(depletions, context, { tenantId, orderId, direction, outletId })
  return { rows, skipped, inventoryItems: context.inventoryItems }
}

/**
 * Put a cancelled order's ingredients back by reversing exactly what its sale
 * recorded, netted per ingredient AND entered unit AND branch (the database
 * does the netting: `apply_order_stock_claim` mode `reverse_all`).
 *
 * The unit keeps the audit value coherent (grams from a base recipe and
 * kilograms from an add-on never sum into one meaningless number); the BRANCH
 * keeps the stock in the shop that spent it, read off the recorded movement so
 * a sale and its reversal cannot disagree by construction.
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
  const simple = await applySimpleOptionStockIsolated(supabase, tenantId, orderId, 'cancel')

  // The void claim is taken at a revision that pairs with the order's latest
  // sale, skipping any void an edit already burned — so a cancellation works
  // on an edited order, and a second cancel after an un-cancel claims fresh.
  const claims = await listOrderStockClaims(supabase, tenantId, orderId)
  const voidRevision = resolveVoidClaimRevision(claims)

  // Claim + reversal + the "what came back" record in ONE transaction, the
  // reversal computed by the database from EVERY movement this order recorded
  // (an edit that removed an item already wrote its own `void`). A sale racing
  // this cancellation is serialised by the per-order lock: it either landed
  // first and is reversed here, or finds this claim and stands down. A
  // cancellation with nothing to reverse still keeps its claim, as that
  // marker.
  const result = await commitOrderLedgerReversal(supabase, tenantId, orderId, voidRevision)
  return { ...result, movementCount: result.movementCount + simple.count }
}
