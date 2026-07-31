/**
 * What happens after stock moves: raising low-stock alerts and taking items off
 * the menu when an ingredient runs out.
 *
 * Both behaviours read the same crossings, so they share one entry point rather
 * than each re-deriving which ingredients changed level. The decisions are pure
 * (`low-stock.ts`, `auto-86.ts`); this module only persists them.
 *
 * Both are per-tenant opt-in and default off. Auto-86 especially: silently
 * hiding a bestseller is a worse failure than selling one portion short, so a
 * merchant has to ask for it.
 *
 * Uses the service-role client for the same reason depletion does — a customer
 * placing an order has no admin session, and inventory RLS is admin-only. Every
 * read and write is filtered on `tenant_id` here.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { InventoryItem, Recipe, RecipeComponent } from '@/types/database'
import {
  detectStockCrossings,
  evaluateStockLevel,
  type StockCrossing,
  type StockLevelInput,
} from '@/lib/inventory/low-stock'
import { resolveMenuItemsToDisable, resolveMenuItemsToReEnable } from '@/lib/inventory/auto-86'
import { branchLevelInputs } from '@/lib/inventory/branch-stock-levels'
import { indexStockRows, type BranchStockIndex, type BranchStockRow } from '@/lib/inventory/stock-location'

/**
 * A branch to scope an alert to, or `undefined` for a caller that has none.
 *
 * `null` is the unbranched store pool — a real shelf. `undefined` is "this
 * movement named no branch", which is every single-shop tenant and every call
 * site written before branches existed.
 */
type AlertOutlet = string | null | undefined

/**
 * Narrows a `stock_alerts` query to the branch an alert is about.
 *
 * Left untouched when there is no branch, so a store-wide caller issues exactly
 * the query it always did and keeps matching the NULL-outlet rows that predate
 * branch-aware alerting.
 */
function scopeToOutlet<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  outletId: AlertOutlet,
): T {
  if (outletId === undefined) return query
  return outletId === null ? query.is('outlet_id', null) : query.eq('outlet_id', outletId)
}

/**
 * What each branch is holding of these ingredients.
 *
 * Service-role, like every read on this path: it runs behind a customer's
 * order, which has no admin session. Filtered on `tenant_id` here instead.
 */
async function readBranchStock(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  itemIds: readonly string[],
): Promise<BranchStockIndex> {
  const { data } = await supabase
    .from('inventory_stock')
    .select('inventory_item_id, outlet_id, current_qty, reorder_level')
    .eq('tenant_id', tenantId)
    .in('inventory_item_id', itemIds)

  return indexStockRows((data ?? []) as unknown as BranchStockRow[])
}

export interface StockLevelChangeResult {
  alertsRaised: number
  alertsResolved: number
  menuItemsDisabled: string[]
  menuItemsReEnabled: string[]
}

const NOTHING_HAPPENED: StockLevelChangeResult = {
  alertsRaised: 0,
  alertsResolved: 0,
  menuItemsDisabled: [],
  menuItemsReEnabled: [],
}

interface TenantAlertFlags {
  lowStockAlertsEnabled: boolean
  auto86Enabled: boolean
}

/** Unreadable or absent flags mean off — never switch a feature on by accident. */
async function readTenantFlags(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<TenantAlertFlags> {
  const { data } = await supabase
    .from('tenants')
    .select('low_stock_alerts_enabled, auto_86_enabled')
    .eq('id', tenantId)
    .single()

  const row = (data ?? {}) as { low_stock_alerts_enabled?: boolean; auto_86_enabled?: boolean }
  return {
    lowStockAlertsEnabled: row.low_stock_alerts_enabled === true,
    auto86Enabled: row.auto_86_enabled === true,
  }
}

/**
 * Ingredients that were touched and now sit at `ok`.
 *
 * Crossing detection deliberately ignores upward moves, but an alert that never
 * closes would leave the dedup guard suppressing the next genuine crossing
 * forever — so recovery is resolved here rather than reported as a crossing.
 */
function resolveRecoveredIds(
  items: readonly StockLevelInput[],
  deltas: ReadonlyMap<string, number>,
): string[] {
  const recovered: string[] = []
  for (const item of items) {
    const delta = deltas.get(item.id)
    if (delta === undefined) continue
    if (evaluateStockLevel(item) === 'ok') continue
    const after = { current_qty: item.current_qty + delta, reorder_level: item.reorder_level }
    if (evaluateStockLevel(after) === 'ok') recovered.push(item.id)
  }
  return recovered
}

/**
 * Ingredients this batch pushed back above empty.
 *
 * Deliberately a different question from `resolveRecoveredIds`, because the two
 * answers serve opposite decisions. Availability asks "can this be made?" and
 * auto-86 only ever fires on `out`, so anything above empty can be cooked and
 * the dish belongs back on the menu. The alert asks "should more be ordered?",
 * which a delivery landing below the reorder level has not answered.
 *
 * Gating both on `ok` was the bug: a partial delivery returned the flour and
 * left the dish hidden, with the banner saying only "low".
 */
function resolveRestockedIds(
  items: readonly StockLevelInput[],
  deltas: ReadonlyMap<string, number>,
): string[] {
  const restocked: string[] = []
  for (const item of items) {
    const delta = deltas.get(item.id)
    if (delta === undefined) continue
    if (evaluateStockLevel(item) !== 'out') continue
    const after = { current_qty: item.current_qty + delta, reorder_level: item.reorder_level }
    if (evaluateStockLevel(after) !== 'out') restocked.push(item.id)
  }
  return restocked
}

/**
 * The branch shelf as it stood BEFORE this batch.
 *
 * Everything downstream takes pre-movement figures plus the deltas just
 * applied — the items handed in are read before the write precisely so the
 * running-total trigger cannot race them. `inventory_stock` gets no such
 * chance: it is only readable after the ledger row exists, so it comes back
 * already reduced. Subtracting the delta puts it back on the same footing.
 *
 * Without this, a shelf that went 15 → 5 against a par level of 20 is read as
 * 5 → -5: an `out` crossing, and an alert for stock that never ran out.
 */
function rewindToPreMovement<T extends StockLevelInput>(
  items: readonly T[],
  deltas: ReadonlyMap<string, number>,
): readonly T[] {
  return items.map((item) => ({
    ...item,
    current_qty: item.current_qty - (deltas.get(item.id) ?? 0),
  }))
}

/** On-hand quantities after this batch, for the ingredients it moved. */
function postMovementQty(
  items: readonly StockLevelInput[],
  deltas: ReadonlyMap<string, number>,
): Map<string, number> {
  const quantities = new Map<string, number>()
  for (const item of items) {
    const delta = deltas.get(item.id)
    if (delta === undefined) continue
    quantities.set(item.id, item.current_qty + delta)
  }
  return quantities
}

async function raiseAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  crossings: readonly StockCrossing[],
  outletId: AlertOutlet,
): Promise<number> {
  if (crossings.length === 0) return 0

  // One open alert per ingredient PER BRANCH. Without this, a receive-then-sell
  // cycle re-alerts for something the merchant already knows about — and
  // without the branch in the key, North's open alert would suppress South's,
  // which is the blindness branch-aware alerting exists to remove.
  const { data: openRows } = await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .select('id, inventory_item_id')
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in(
        'inventory_item_id',
        crossings.map((c) => c.itemId),
      ),
    outletId,
  )

  const alreadyOpen = new Set(
    ((openRows ?? []) as unknown as Array<{ inventory_item_id: string }>).map(
      (r) => r.inventory_item_id,
    ),
  )

  const rows = crossings
    .filter((c) => !alreadyOpen.has(c.itemId))
    .map((c) => ({
      tenant_id: tenantId,
      inventory_item_id: c.itemId,
      level: c.to,
      quantity: c.quantity,
      reorder_level: c.reorderLevel,
      // NULL for a store-wide caller, which is what the column means for every
      // row written before branches existed.
      outlet_id: outletId ?? null,
    }))
  if (rows.length === 0) return 0

  // Deliberately uncast. Every other write in this file still carries
  // `as never` because the generated types lag the schema, but these rows are
  // now fully typed, and letting TypeScript check them is the only thing that
  // catches a row that forgot the branch — which would raise the alert against
  // the whole store instead of the one shop that is short.
  await supabase.from('stock_alerts').insert(rows)
  return rows.length
}

async function resolveAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  recoveredIds: readonly string[],
  outletId: AlertOutlet,
): Promise<number> {
  if (recoveredIds.length === 0) return 0

  const { data: openRows } = await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .select('id, inventory_item_id')
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in('inventory_item_id', recoveredIds),
    outletId,
  )

  const open = (openRows ?? []) as unknown as Array<{ inventory_item_id: string }>
  if (open.length === 0) return 0

  // Scoped for the same reason the raise is: a delivery at North must not close
  // South's alert, which is still true.
  await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in('inventory_item_id', recoveredIds),
    outletId,
  )

  return open.length
}

/**
 * Correct an open alert that a partial delivery has made untrue.
 *
 * An alert row is a snapshot of the moment it was raised, and nothing revised
 * it. A delivery that lifts an ingredient off empty without clearing its
 * reorder level does not resolve the alert — the merchant does still need to
 * reorder — but it does make the alert's own words wrong, leaving the banner
 * saying "Flour is out of stock" over a shelf with flour on it.
 *
 * Narrow on purpose: only the `out` → `low` improvement is rewritten. A
 * downward move is a crossing, which raises its own alert, and reaching `ok`
 * resolves rather than rewrites.
 */
async function refreshOpenAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  items: readonly StockLevelInput[],
  deltas: ReadonlyMap<string, number>,
  outletId: AlertOutlet,
): Promise<void> {
  for (const item of items) {
    const delta = deltas.get(item.id)
    if (delta === undefined) continue
    if (evaluateStockLevel(item) !== 'out') continue

    const quantity = item.current_qty + delta
    if (evaluateStockLevel({ current_qty: quantity, reorder_level: item.reorder_level }) !== 'low') {
      continue
    }

    await scopeToOutlet(
      supabase
        .from('stock_alerts')
        .update({ level: 'low', quantity } as never)
        .eq('tenant_id', tenantId)
        .eq('inventory_item_id', item.id)
        .is('resolved_at', null),
      outletId,
    )
  }
}

/** Base recipes touched by these ingredients, with their full component lists. */
async function loadBaseRecipes(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  ingredientIds: readonly string[],
): Promise<{ recipes: Recipe[]; components: RecipeComponent[] }> {
  // Narrowed to the recipes that actually mention one of these ingredients, so
  // this never loads a tenant's whole recipe book to decide about one item.
  const { data: touchedRows } = await supabase
    .from('recipe_components')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('inventory_item_id', ingredientIds)

  const touched = (touchedRows ?? []) as unknown as RecipeComponent[]
  if (touched.length === 0) return { recipes: [], components: [] }

  const { data: recipeRows } = await supabase
    .from('recipes')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(touched.map((c) => c.recipe_id))])

  return { recipes: (recipeRows ?? []) as unknown as Recipe[], components: touched }
}

/**
 * Take off the menu every item whose base recipe needs an ingredient that just
 * ran out, stamping each one as auto-disabled.
 *
 * The stamp is what makes recovery safe: without it there is no way to tell an
 * item this system hid from one the merchant deliberately turned off, and the
 * next delivery would put the merchant's hidden item back on the menu. For the
 * same reason the update only claims items that are currently available.
 */
async function applyAuto86(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  crossings: readonly StockCrossing[],
): Promise<string[]> {
  const outIds = crossings.filter((c) => c.to === 'out').map((c) => c.itemId)
  if (outIds.length === 0) return []

  const { recipes, components } = await loadBaseRecipes(supabase, tenantId, outIds)
  if (components.length === 0) return []

  const menuItemIds = resolveMenuItemsToDisable(outIds, recipes, components)
  if (menuItemIds.length === 0) return []

  await supabase
    .from('menu_items')
    .update({ is_available: false, auto_disabled_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .in('id', menuItemIds)

  return menuItemIds
}

/**
 * Put back on the menu the items this system took off, once every ingredient
 * their base recipe needs is stocked again.
 *
 * Ownership is enforced in the UPDATE itself rather than by reading first and
 * writing after: a merchant toggling availability between the two statements
 * would otherwise have their choice overwritten. What the statement actually
 * matched is what gets reported.
 */
async function applyAuto86Recovery(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  restockedIds: readonly string[],
  postMovementQty: ReadonlyMap<string, number>,
): Promise<string[]> {
  if (restockedIds.length === 0) return []

  const { recipes, components } = await loadBaseRecipes(supabase, tenantId, restockedIds)
  if (components.length === 0) return []

  const outOfStockIds = await resolveOutOfStockIds(
    supabase,
    tenantId,
    components,
    postMovementQty,
  )

  const menuItemIds = resolveMenuItemsToReEnable(restockedIds, recipes, components, outOfStockIds)
  if (menuItemIds.length === 0) return []

  const { data } = await supabase
    .from('menu_items')
    .update({ is_available: true, auto_disabled_at: null } as never)
    .eq('tenant_id', tenantId)
    .in('id', menuItemIds)
    .not('auto_disabled_at', 'is', null)
    .select('id')

  return ((data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id)
}

/**
 * Which of these recipes' ingredients are empty right now.
 *
 * Quantities for the ingredients that just moved come from the applied deltas,
 * not from the database: re-reading a row the ledger trigger is still updating
 * races it and reads a stale total. Everything else is read normally.
 */
async function resolveOutOfStockIds(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  components: readonly RecipeComponent[],
  postMovementQty: ReadonlyMap<string, number>,
): Promise<string[]> {
  const ingredientIds = [...new Set(components.map((c) => c.inventory_item_id))]

  const { data } = await supabase
    .from('inventory_items')
    .select('id, current_qty, reorder_level')
    .eq('tenant_id', tenantId)
    .in('id', ingredientIds)

  const rows = (data ?? []) as unknown as Array<{ id: string; current_qty: number }>

  return rows
    .map((row) => ({ id: row.id, current_qty: postMovementQty.get(row.id) ?? row.current_qty }))
    .filter((row) => evaluateStockLevel({ current_qty: row.current_qty, reorder_level: 0 }) === 'out')
    .map((row) => row.id)
}

/**
 * React to a batch of stock movements: alert on ingredients that crossed a
 * line, close alerts on ingredients that recovered, and 86 what can no longer
 * be made.
 *
 * Never throws. This runs behind an order that is already placed and paid for —
 * a failed alert must not surface to a customer as a failed sale.
 *
 * **Alerts are a branch's question; auto-86 is still the store's.** They read
 * different figures on purpose. An alert interrupts whoever can act on it, and
 * the shop with the empty shelf is the one that needs telling. Auto-86 flips
 * `menu_items.is_available`, which is store-wide — 86ing the chain because one
 * shop ran out would hide a bestseller everywhere, which is a worse failure
 * than the blindness it would be fixing. It stays on the roll-up until
 * availability itself is per-branch.
 */
export async function processStockLevelChanges(
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
  outletId?: string | null,
): Promise<StockLevelChangeResult> {
  try {
    // The roll-up questions, which auto-86 and its recovery answer from.
    const storeCrossings = detectStockCrossings(items, deltas)
    const restockedIds = resolveRestockedIds(items, deltas)

    const supabase = createAdminClient()

    // Only when a branch was actually named. A store-wide caller never touches
    // the branch table and behaves exactly as it did before branches existed.
    const branchItems =
      outletId === undefined
        ? items
        : rewindToPreMovement(
            branchLevelInputs(
              items,
              await readBranchStock(
                supabase,
                tenantId,
                items.map((item) => item.id),
              ),
              outletId,
            ),
            deltas,
          )

    const crossings = detectStockCrossings(branchItems, deltas)
    const recoveredIds = resolveRecoveredIds(branchItems, deltas)

    if (
      crossings.length === 0 &&
      recoveredIds.length === 0 &&
      storeCrossings.length === 0 &&
      restockedIds.length === 0
    ) {
      return NOTHING_HAPPENED
    }

    const flags = await readTenantFlags(supabase, tenantId)

    const alertsRaised = flags.lowStockAlertsEnabled
      ? await raiseAlerts(supabase, tenantId, crossings, outletId)
      : 0
    const alertsResolved = flags.lowStockAlertsEnabled
      ? await resolveAlerts(supabase, tenantId, recoveredIds, outletId)
      : 0
    if (flags.lowStockAlertsEnabled) {
      await refreshOpenAlerts(supabase, tenantId, branchItems, deltas, outletId)
    }
    const menuItemsDisabled = flags.auto86Enabled
      ? await applyAuto86(supabase, tenantId, storeCrossings)
      : []
    const menuItemsReEnabled = flags.auto86Enabled
      ? await applyAuto86Recovery(supabase, tenantId, restockedIds, postMovementQty(items, deltas))
      : []

    return { alertsRaised, alertsResolved, menuItemsDisabled, menuItemsReEnabled }
  } catch (error) {
    console.error('[inventory] Failed to process stock level changes', tenantId, error)
    return NOTHING_HAPPENED
  }
}
