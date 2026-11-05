/**
 * What happens after stock moves: raising low-stock alerts and taking items off
 * the menu when an ingredient runs out.
 *
 * They answer different questions, so they read differently. An ALERT is news:
 * only the movement that carries an ingredient across a line raises one
 * (`low-stock.ts`), or a low ingredient would alert once per sale. AUTO-86 is
 * a state: after every movement, any dish that cannot be made is off
 * (`auto-86-service.ts`, decided on the shelf as it stands — the crossing-only
 * version never re-hid a dish turned back on over an empty shelf). The
 * decisions are pure (`low-stock.ts`, `auto-86.ts`); this module persists the
 * alerts and hands auto-86 the ingredients that moved.
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
import type { InventoryItem } from '@/types/database'
import {
  detectStockCrossings,
  evaluateStockLevel,
  type StockCrossing,
  type StockLevelInput,
} from '@/lib/inventory/low-stock'
import { reconcileAuto86 } from '@/lib/inventory/auto-86-service'
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
): Promise<BranchStockIndex | null> {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select('inventory_item_id, outlet_id, current_qty, reorder_level')
    .eq('tenant_id', tenantId)
    .in('inventory_item_id', itemIds)

  // Unreadable is NOT an empty shelf: read as zero, every ingredient in the
  // batch would "cross" to out and alert over stock nobody looked at.
  if (error) {
    console.error('[inventory] Branch stock read failed; skipping branch alerts', tenantId, error.message)
    return null
  }
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

/** Postgres unique_violation: a concurrent writer raised the same open alert. */
const UNIQUE_VIOLATION = '23505'

/** Alert writes never fail an order; they are logged where Vercel can see them. */
function logAlertWriteFailure(step: string, tenantId: string, error: { message: string; code?: string }): void {
  console.error(`[inventory] Stock alert ${step} failed`, tenantId, error.code ?? '', error.message)
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
  const { data, error } = await supabase
    .from('tenants')
    .select('low_stock_alerts_enabled, auto_86_enabled')
    .eq('id', tenantId)
    .single()
  if (error) console.error('[inventory] Tenant alert flags unreadable; treating both as off', tenantId, error.message)

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

interface OpenAlertRow {
  id: string
  inventory_item_id: string
  level: string
  outlet_id: string | null
}

/**
 * An open "low" alert whose ingredient has now run out becomes "out".
 *
 * The dedup guard keeps one open alert per ingredient, so without this the
 * low -> out crossing was swallowed: the row kept saying "low" over an empty
 * shelf and nobody was told. The UPDATE is what the bell's trigger
 * (`stock_alerts_notify_escalation`) turns into an "out of stock" notice.
 * Counted as raised: it is a new thing the merchant needs to hear.
 *
 * A store-wide caller (`outletId === undefined`) computed its crossing from
 * the roll-up, so only the store-wide row is about that figure — never a
 * branch's, whose shelf it did not look at. One UPDATE per distinct quantity
 * (normally just one), so a batch is one trigger statement and one push.
 */
async function escalateOpenAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  crossings: readonly StockCrossing[],
  openRows: readonly OpenAlertRow[],
  outletId: AlertOutlet,
): Promise<number> {
  const outQuantity = new Map(
    crossings.filter((c) => c.to === 'out').map((c) => [c.itemId, c.quantity]),
  )
  const targets = openRows.filter(
    (row) =>
      row.level === 'low' &&
      outQuantity.has(row.inventory_item_id) &&
      (outletId !== undefined || row.outlet_id === null),
  )

  const idsByQuantity = new Map<number, string[]>()
  for (const row of targets) {
    const quantity = outQuantity.get(row.inventory_item_id) ?? 0
    idsByQuantity.set(quantity, [...(idsByQuantity.get(quantity) ?? []), row.id])
  }

  let escalated = 0
  for (const [quantity, ids] of idsByQuantity) {
    const { error } = await supabase
      .from('stock_alerts')
      .update({ level: 'out', quantity } as never)
      .eq('tenant_id', tenantId)
      .in('id', ids)
      .is('resolved_at', null)
    if (error) {
      logAlertWriteFailure('escalate', tenantId, error)
      continue
    }
    escalated += ids.length
  }
  return escalated
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
  const { data: openRows, error: openError } = await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .select('id, inventory_item_id, level, outlet_id')
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in(
        'inventory_item_id',
        crossings.map((c) => c.itemId),
      ),
    outletId,
  )
  // Without the open rows the dedup guard is blind: raising now would stack a
  // second alert (and a second push) on one the merchant already has.
  if (openError) {
    logAlertWriteFailure('read open alerts', tenantId, openError)
    return 0
  }

  const open = (openRows ?? []) as unknown as OpenAlertRow[]
  const alreadyOpen = new Set(open.map((r) => r.inventory_item_id))

  const escalated = await escalateOpenAlerts(supabase, tenantId, crossings, open, outletId)

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
  if (rows.length === 0) return escalated

  // Deliberately uncast. Every other write in this file still carries
  // `as never` because the generated types lag the schema, but these rows are
  // now fully typed, and letting TypeScript check them is the only thing that
  // catches a row that forgot the branch — which would raise the alert against
  // the whole store instead of the one shop that is short.
  const { error } = await supabase.from('stock_alerts').insert(rows)
  if (!error) return rows.length + escalated
  if (error.code !== UNIQUE_VIOLATION) {
    logAlertWriteFailure('raise', tenantId, error)
    return escalated
  }

  // A concurrent order raised one of these first (one open alert per
  // ingredient per branch is a unique index). The batch insert is all or
  // nothing, so retry row by row: the others are still news.
  let raised = 0
  for (const row of rows) {
    const { error: rowError } = await supabase.from('stock_alerts').insert([row])
    if (!rowError) raised += 1
    else if (rowError.code !== UNIQUE_VIOLATION) logAlertWriteFailure('raise', tenantId, rowError)
  }
  return raised + escalated
}

async function resolveAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  recoveredIds: readonly string[],
  outletId: AlertOutlet,
): Promise<number> {
  if (recoveredIds.length === 0) return 0

  const { data: openRows, error: openError } = await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .select('id, inventory_item_id')
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in('inventory_item_id', recoveredIds),
    outletId,
  )
  if (openError) {
    logAlertWriteFailure('read open alerts', tenantId, openError)
    return 0
  }

  const open = (openRows ?? []) as unknown as Array<{ inventory_item_id: string }>
  if (open.length === 0) return 0

  // Scoped for the same reason the raise is: a delivery at North must not close
  // South's alert, which is still true.
  const { error } = await scopeToOutlet(
    supabase
      .from('stock_alerts')
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
      .in('inventory_item_id', recoveredIds),
    outletId,
  )
  if (error) {
    logAlertWriteFailure('resolve', tenantId, error)
    return 0
  }

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

    const { error } = await scopeToOutlet(
      supabase
        .from('stock_alerts')
        .update({ level: 'low', quantity } as never)
        .eq('tenant_id', tenantId)
        .eq('inventory_item_id', item.id)
        .is('resolved_at', null),
      outletId,
    )
    if (error) logAlertWriteFailure('refresh', tenantId, error)
  }
}

/**
 * React to a batch of stock movements: alert on ingredients that crossed a
 * line, close alerts on ingredients that recovered, and 86 — or restore — what
 * can or can't be made now.
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
 *
 * Auto-86 runs on EVERY batch for a store that has it on, crossing or not:
 * it decides on the level (`auto-86-service.ts`).
 */
export async function processStockLevelChanges(
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
  outletId?: string | null,
): Promise<StockLevelChangeResult> {
  if (deltas.size === 0) return NOTHING_HAPPENED
  try {
    const supabase = createAdminClient()
    const flags = await readTenantFlags(supabase, tenantId)
    if (!flags.lowStockAlertsEnabled && !flags.auto86Enabled) return NOTHING_HAPPENED

    const alerts = flags.lowStockAlertsEnabled
      ? await processAlerts(supabase, tenantId, items, deltas, outletId)
      : { alertsRaised: 0, alertsResolved: 0 }
    const auto86 = flags.auto86Enabled
      ? await runAuto86(supabase, tenantId, [...deltas.keys()])
      : { disabled: [], reEnabled: [] }

    return { ...alerts, menuItemsDisabled: auto86.disabled, menuItemsReEnabled: auto86.reEnabled }
  } catch (error) {
    console.error('[inventory] Failed to process stock level changes', tenantId, error)
    return NOTHING_HAPPENED
  }
}

async function processAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
  outletId: AlertOutlet,
): Promise<{ alertsRaised: number; alertsResolved: number }> {
  // Only when a branch was actually named. A store-wide caller never touches
  // the branch table and behaves exactly as it did before branches existed.
  let branchItems: readonly StockLevelInput[] = items
  if (outletId !== undefined) {
    const branchStock = await readBranchStock(supabase, tenantId, items.map((item) => item.id))
    if (!branchStock) return { alertsRaised: 0, alertsResolved: 0 }
    branchItems = rewindToPreMovement(branchLevelInputs(items, branchStock, outletId), deltas)
  }

  const crossings = detectStockCrossings(branchItems, deltas)
  const recoveredIds = resolveRecoveredIds(branchItems, deltas)

  const alertsRaised = await raiseAlerts(supabase, tenantId, crossings, outletId)
  const alertsResolved = await resolveAlerts(supabase, tenantId, recoveredIds, outletId)
  await refreshOpenAlerts(supabase, tenantId, branchItems, deltas, outletId)
  return { alertsRaised, alertsResolved }
}

/** Auto-86 failing must not cost the alerts (or the order): logged, reported as nothing. */
async function runAuto86(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  ingredientIds: readonly string[],
): Promise<{ disabled: string[]; reEnabled: string[] }> {
  try {
    return await reconcileAuto86(supabase, tenantId, ingredientIds)
  } catch (error) {
    console.error('[inventory] Auto-86 failed', tenantId, error)
    return { disabled: [], reEnabled: [] }
  }
}
