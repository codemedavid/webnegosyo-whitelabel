/**
 * Setting one branch's reorder level.
 *
 * Phase C taught the alert path to read `inventory_stock.reorder_level` and to
 * fall back to the store's when a branch has not chosen one
 * (`branch-stock-levels.ts`). This is the other half: the write that lets a
 * quiet shop be warned at 5 kg while a busy one is warned at 50.
 *
 * **Why this is not an upsert.** `inventory_stock` is a trigger-maintained
 * table: `current_qty` is written only by `apply_stock_movement`, and
 * `inventory_items.current_qty` is a roll-up derived from it. An upsert would
 * have to supply `current_qty`, and supplying it on a row that already exists
 * would empty a physically full shelf from a settings screen — a stock loss
 * with no movement in the ledger to explain it, which is the one thing the
 * ledger exists to make impossible. So: update the level alone, and insert only
 * when there is genuinely no row to update.
 *
 * The write goes through the RLS-enforcing server client, like
 * `branch-stock-read.ts` and unlike the order pipeline's service-role writes.
 * The `inventory_stock` policy is branch-scoped, so a branch manager setting a
 * level for somebody else's shop is refused by the database rather than by this
 * function.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'

/**
 * Zero is meaningful: it is how `branchLevelInputs` already spells "this branch
 * has not chosen a level", so clearing a branch override has to be expressible.
 * Negative is not — a threshold below zero can never be crossed, so it would
 * read as "never warn me" while looking like a configured number.
 */
const reorderLevelSchema = z.number().finite().min(0)

/**
 * Set (or clear, with 0) one branch's reorder level for one ingredient.
 *
 * `outletId` of `null` addresses the unbranched store pool, which is a real
 * shelf rather than an absence — matched with `IS NULL`, since `= NULL` matches
 * nothing in SQL and would quietly create a second pool row on every save.
 *
 * Throws rather than returning an error shape: a merchant is watching this
 * save, and a silent failure would leave them believing a threshold is set that
 * would never fire.
 */
export async function setBranchReorderLevel(
  tenantId: string,
  inventoryItemId: string,
  outletId: string | null,
  reorderLevel: number,
): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const level = reorderLevelSchema.parse(reorderLevel)

  const supabase = await createClient()

  const scoped = <T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
    query: T,
  ): T => (outletId === null ? query.is('outlet_id', null) : query.eq('outlet_id', outletId))

  // The level alone. Never current_qty — see the module note.
  const { data: updated, error: updateError } = await scoped(
    supabase
      .from('inventory_stock')
      .update({ reorder_level: level } as never)
      .eq('tenant_id', tenantId)
      .eq('inventory_item_id', inventoryItemId),
  ).select('id')

  if (updateError) throw updateError
  if ((updated ?? []).length > 0) return

  // No row yet. A branch that has never received stock still needs a threshold
  // — it is exactly the branch someone wants warned earlier than the rest — and
  // zero is the honest on-hand figure for a shelf holding nothing.
  const { error: insertError } = await supabase.from('inventory_stock').insert({
    tenant_id: tenantId,
    inventory_item_id: inventoryItemId,
    outlet_id: outletId,
    reorder_level: level,
    current_qty: 0,
  } as never)

  if (insertError) throw insertError
}
