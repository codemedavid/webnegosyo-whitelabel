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
): Promise<number> {
  if (crossings.length === 0) return 0

  // One open alert per ingredient. Without this, a receive-then-sell cycle
  // re-alerts for something the merchant already knows about.
  const { data: openRows } = await supabase
    .from('stock_alerts')
    .select('id, inventory_item_id')
    .eq('tenant_id', tenantId)
    .is('resolved_at', null)
    .in(
      'inventory_item_id',
      crossings.map((c) => c.itemId),
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
    }))
  if (rows.length === 0) return 0

  await supabase.from('stock_alerts').insert(rows as never)
  return rows.length
}

async function resolveAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  recoveredIds: readonly string[],
): Promise<number> {
  if (recoveredIds.length === 0) return 0

  const { data: openRows } = await supabase
    .from('stock_alerts')
    .select('id, inventory_item_id')
    .eq('tenant_id', tenantId)
    .is('resolved_at', null)
    .in('inventory_item_id', recoveredIds)

  const open = (openRows ?? []) as unknown as Array<{ inventory_item_id: string }>
  if (open.length === 0) return 0

  await supabase
    .from('stock_alerts')
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .is('resolved_at', null)
    .in('inventory_item_id', recoveredIds)

  return open.length
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
  recoveredIds: readonly string[],
  postMovementQty: ReadonlyMap<string, number>,
): Promise<string[]> {
  if (recoveredIds.length === 0) return []

  const { recipes, components } = await loadBaseRecipes(supabase, tenantId, recoveredIds)
  if (components.length === 0) return []

  const outOfStockIds = await resolveOutOfStockIds(
    supabase,
    tenantId,
    components,
    postMovementQty,
  )

  const menuItemIds = resolveMenuItemsToReEnable(recoveredIds, recipes, components, outOfStockIds)
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
 */
export async function processStockLevelChanges(
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
): Promise<StockLevelChangeResult> {
  try {
    const crossings = detectStockCrossings(items, deltas)
    const recoveredIds = resolveRecoveredIds(items, deltas)
    if (crossings.length === 0 && recoveredIds.length === 0) return NOTHING_HAPPENED

    const supabase = createAdminClient()
    const flags = await readTenantFlags(supabase, tenantId)

    const alertsRaised = flags.lowStockAlertsEnabled
      ? await raiseAlerts(supabase, tenantId, crossings)
      : 0
    const alertsResolved = flags.lowStockAlertsEnabled
      ? await resolveAlerts(supabase, tenantId, recoveredIds)
      : 0
    const menuItemsDisabled = flags.auto86Enabled
      ? await applyAuto86(supabase, tenantId, crossings)
      : []
    const menuItemsReEnabled = flags.auto86Enabled
      ? await applyAuto86Recovery(supabase, tenantId, recoveredIds, postMovementQty(items, deltas))
      : []

    return { alertsRaised, alertsResolved, menuItemsDisabled, menuItemsReEnabled }
  } catch (error) {
    console.error('[inventory] Failed to process stock level changes', tenantId, error)
    return NOTHING_HAPPENED
  }
}
