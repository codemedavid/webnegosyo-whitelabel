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
import { resolveMovementOutletId } from '@/lib/inventory/stock-location'
import {
  claimOrderStockApplication,
  releaseOrderStockApplication,
  listOrderStockClaims,
  resolveRedepletionRevision,
  resolveVoidClaimRevision,
  hasBlockingVoidClaim,
} from '@/lib/inventory/order-stock-claim'
import {
  buildDepletionItemsFromOrderRows,
  type OrderItemRow,
} from '@/lib/inventory/customer-order-items'
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
 * The one branch a batch of ledger rows belongs to, or `undefined` if they
 * straddle more than one.
 *
 * A reversal reads its branch off the recorded movements, and an order whose
 * branch was corrected mid-life can have legs on two shelves. Naming one of
 * them would alert about a shelf half the rows never touched, so an ambiguous
 * batch falls back to the store-wide behaviour it has always had.
 */
function soleOutletId(
  rows: ReadonlyArray<{ outlet_id?: unknown }>,
): string | null | undefined {
  if (rows.length === 0) return undefined
  const outletOf = (row: { outlet_id?: unknown }) =>
    typeof row.outlet_id === 'string' ? row.outlet_id : null

  const first = outletOf(rows[0])
  return rows.every((row) => outletOf(row) === first) ? first : undefined
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
  outletId?: string | null,
): Promise<void> {
  try {
    const { processStockLevelChanges } = await import('@/lib/inventory/stock-alerts-service')
    await processStockLevelChanges(tenantId, items, deltas, outletId)
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
): Promise<OrderStockResult> {
  if (items.length === 0) return EMPTY_RESULT
  const supabase = createAdminClient()

  // Idempotency. The order-creation path is retryable, and depleting twice
  // would take stock down twice for one sale with two ledger rows each claiming
  // to be the truth. The claim is a unique-indexed row, so the database refuses
  // the second caller — a SELECT-then-INSERT here let every racing call through.
  if (!(await claimOrderStockApplication(supabase, tenantId, orderId, direction, revision))) {
    return EMPTY_RESULT
  }

  // Every exit between the claim and the ledger write has to hand the claim
  // back. A claim that outlives a depletion which never happened marks the
  // order permanently done with its stock still on the shelf — the failure mode
  // is silent, and worse than the double-deduction the claim exists to stop.
  try {
    // Cancel wins. Depletion is fire-and-forget, so a fast cancellation can
    // take its void claim before the sale's rows land. The reverse keeps that
    // claim even when it found nothing to reverse — it is this guard — so a
    // sale arriving afterwards must stand down, hand its claim back, and leave
    // the cancelled order with no stock moved in either direction.
    if (direction === 'sale') {
      const claims = await listOrderStockClaims(supabase, tenantId, orderId)
      if (hasBlockingVoidClaim(claims, revision)) {
        await releaseOrderStockApplication(supabase, tenantId, orderId, direction, revision)
        return EMPTY_RESULT
      }
    }

    const result = await depleteClaimedOrder(
      supabase,
      tenantId,
      orderId,
      items,
      direction,
      resolveMovementOutletId(outletId),
    )
    if (result.movementCount === 0) {
      await releaseOrderStockApplication(supabase, tenantId, orderId, direction, revision)
    }
    return result
  } catch (error) {
    await releaseOrderStockApplication(supabase, tenantId, orderId, direction, revision)
    throw error
  }
}

/**
 * The depletion itself, once this caller owns the claim.
 *
 * Split out so the claim's release has exactly one place to live: this body has
 * five exits and a caller that forgot one of them would leak a claim.
 */
async function depleteClaimedOrder(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void',
  outletId: string | null,
): Promise<OrderStockResult> {

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
      outlet_id: outletId,
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
  await notifyStockLevelChanges(tenantId, inventoryItems, deltas, soleOutletId(rows))

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

  // The void claim is taken at a revision that pairs with the order's latest
  // sale, skipping any void an edit already burned — so a cancellation works
  // on an edited order, and a second cancel after an un-cancel claims fresh.
  const claims = await listOrderStockClaims(supabase, tenantId, orderId)
  const voidRevision = resolveVoidClaimRevision(claims)

  // Claim BEFORE reading movements — cancelling twice would put the stock back
  // twice, and the database refusing the second caller is the guard. Claiming
  // first also closes the race against the fire-and-forget depletion: a sale
  // landing after this claim is seen by the read below and reversed, and a
  // sale that has not landed yet finds this claim and stands down. Reading
  // first (as this used to) returned EMPTY without any claim, and a sale
  // landing a moment later was never reversed.
  if (!(await claimOrderStockApplication(supabase, tenantId, orderId, 'void', voidRevision))) {
    return EMPTY_RESULT
  }

  // EVERY movement this order recorded, not just its sale.
  //
  // Filtering to `sale` was correct exactly as long as a sale was the only
  // thing an order could record. Order editing broke that: an edit that removes
  // an item writes a `void` correction putting those ingredients back while the
  // order is still live, so reversing the sale rows alone gives back stock that
  // was already given back — inventing inventory that never existed.
  const { data: movementRows, error: movementError } = await supabase
    .from('stock_movements')
    .select('inventory_item_id, outlet_id, quantity_delta, entered_quantity, entered_unit_id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (movementError) {
    // A claim outliving a read that never happened would leave the order
    // permanently un-restorable; hand it back so the cancel can retry.
    await releaseOrderStockApplication(supabase, tenantId, orderId, 'void', voidRevision)
    throw movementError
  }

  const movements = (movementRows ?? []) as unknown as Array<{
    inventory_item_id: string
    outlet_id: string | null
    quantity_delta: number
    entered_quantity: number | null
    entered_unit_id: string | null
  }>
  // Nothing recorded (yet). The claim is deliberately KEPT: it is the marker
  // the sale path checks, so a depletion racing this cancellation no-ops
  // instead of spending stock for an order that no longer exists.
  if (movements.length === 0) return EMPTY_RESULT

  // Read before writing, for the same reason depletion does: the alert path
  // compares these rows against the deltas about to be applied, and re-reading
  // afterwards would race the running-total trigger. A failure here must not
  // stop the reversal — putting the stock back matters more than alerting on it.
  const { data: itemRows } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(movements.map((m) => m.inventory_item_id))])
  const inventoryItems = (itemRows ?? []) as unknown as InventoryItem[]

  // Netted per ingredient AND entered unit AND branch.
  //
  // The unit keeps the audit value coherent: the same ingredient can be
  // recorded in grams by a base recipe and kilograms by an addon, and summing
  // those into one `entered_quantity` would print a number that means nothing.
  //
  // The BRANCH keeps the stock in the right shop. An order that spent flour at
  // two branches — or whose branch was corrected mid-life — nets to one row
  // without it, and that row would take stock out of one pool and give it back
  // to another, leaving the branch that actually spent it permanently short.
  // The branch is read off the recorded movement rather than re-resolved from
  // the order, so a sale and its reversal cannot disagree by construction.
  const netted = new Map<
    string,
    {
      inventoryItemId: string
      outletId: string | null
      enteredUnitId: string | null
      delta: number
      entered: number
    }
  >()

  for (const movement of movements) {
    const key = `${movement.inventory_item_id}|${movement.entered_unit_id ?? ''}|${movement.outlet_id ?? ''}`
    const existing = netted.get(key)
    // `entered_quantity` is stored unsigned — the reason carries the direction —
    // so it has to be signed by its own movement before it can be netted.
    // Summing the raw magnitudes would report 800 g entered for a 400 g net.
    const enteredSigned =
      (movement.entered_quantity ?? 0) * Math.sign(movement.quantity_delta)

    netted.set(key, {
      inventoryItemId: movement.inventory_item_id,
      outletId: movement.outlet_id ?? null,
      enteredUnitId: movement.entered_unit_id,
      delta: (existing?.delta ?? 0) + movement.quantity_delta,
      entered: (existing?.entered ?? 0) + enteredSigned,
    })
  }

  const rows = [...netted.values()]
    // An ingredient an edit already returned in full has nothing left to give
    // back, and a zero-delta ledger row reads as a real event that never was.
    .filter((entry) => entry.delta !== 0)
    .map((entry) => ({
      tenant_id: tenantId,
      inventory_item_id: entry.inventoryItemId,
      outlet_id: entry.outletId,
      reason: 'void' as const,
      quantity_delta: -entry.delta,
      // Carried across so the reversal reads "0.6 kg returned", matching the
      // sale's audit trail rather than showing a bare converted number.
      entered_quantity: entry.entered === 0 ? null : Math.abs(entry.entered),
      entered_unit_id: entry.enteredUnitId,
      order_id: orderId,
    }))

  if (rows.length === 0) return EMPTY_RESULT

  const { error: insertError } = await supabase.from('stock_movements').insert(rows as never)
  if (insertError) {
    // The claim outliving a reversal that never wrote would leave the order
    // permanently un-restorable, its ingredients still counted as sold.
    await releaseOrderStockApplication(supabase, tenantId, orderId, 'void', voidRevision)
    throw insertError
  }

  // A cancellation is a restock. Without this the ingredient came back but the
  // alert stayed open and the dish auto-86'd by the original sale stayed off
  // the menu, with the one screen that would explain why now showing nothing.
  const deltas = new Map<string, number>()
  for (const row of rows) {
    deltas.set(row.inventory_item_id, (deltas.get(row.inventory_item_id) ?? 0) + row.quantity_delta)
  }
  await notifyStockLevelChanges(tenantId, inventoryItems, deltas, soleOutletId(rows))

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
 * Spend an un-cancelled order's ingredients again.
 *
 * Cancelling restored the stock and burned the ('sale', 0) and ('void', 0)
 * claims, so flipping the order back to an active status used to leave its
 * ingredients on the shelf forever — no path could ever move stock for it
 * again. This re-depletes at a FRESH revision (one above every claim the order
 * holds), reusing the same machinery a saved edit does, so a second
 * cancellation can claim its matching void and the pair never collides.
 *
 * Items come from the order's own saved lines, the same way the customer-app
 * depletion route derives them — the caller supplies nothing steerable.
 * Best-effort: a stock write must never make a status change fail.
 */
export async function redepleteOrderStockBestEffort(
  tenantId: string,
  orderId: string,
): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .select('id, outlet_id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (orderError) throw orderError
    if (!orderRow) return

    const { data: itemRows, error: itemsError } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity')
      .eq('order_id', orderId)
    if (itemsError) throw itemsError

    const items = buildDepletionItemsFromOrderRows(
      (itemRows ?? []) as unknown as OrderItemRow[],
    )
    if (items.length === 0) return

    const claims = await listOrderStockClaims(supabase, tenantId, orderId)
    const revision = resolveRedepletionRevision(claims)
    const outletId = (orderRow as { outlet_id?: string | null }).outlet_id ?? null

    const result = await applyOrderStockMovements(
      tenantId,
      orderId,
      items,
      'sale',
      revision,
      outletId,
    )
    if (result.skipped.length > 0) {
      console.warn('[inventory] Skipped stock movements for un-cancelled order', {
        orderId,
        skipped: result.skipped,
      })
    }
  } catch (error) {
    console.error('[inventory] Re-depletion failed for un-cancelled order', orderId, error)
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
  revision: number = 0,
  outletId: string | null = null,
): Promise<void> {
  try {
    const result = await applyOrderStockMovements(
      tenantId,
      orderId,
      items,
      direction,
      revision,
      outletId,
    )
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

/**
 * Move the stock a saved order edit is responsible for.
 *
 * An edit moves only the DIFFERENCE — the order's original sale already spent
 * its ingredients. Both directions can appear in one edit (a customer swaps a
 * bun for a latte), so this writes up to two ledger entries and claims each
 * against the revision being saved.
 *
 * Best-effort, like every other order-driven stock write: by the time this runs
 * the bill has been rewritten and the money settled. A drifting ledger is
 * reconcilable by stocktake; a save that refuses to complete because of a stock
 * write leaves the customer holding a receipt that disagrees with the kitchen.
 */
export async function applyOrderRevisionStockBestEffort(
  tenantId: string,
  orderId: string,
  revision: number,
  deplete: readonly DepletionOrderItem[],
  restore: readonly DepletionOrderItem[],
  outletId: string | null = null,
): Promise<void> {
  // Returns first. If the two directions touch the same ingredient — which a
  // swap between two dishes sharing one — putting stock back before taking it
  // out keeps the running total from dipping through a floor it never really
  // crossed, and so from auto-86ing a dish for the width of one transaction.
  if (restore.length > 0) {
    await applyOrderStockBestEffort(tenantId, orderId, restore, 'void', revision, outletId)
  }
  if (deplete.length > 0) {
    await applyOrderStockBestEffort(tenantId, orderId, deplete, 'sale', revision, outletId)
  }
}
