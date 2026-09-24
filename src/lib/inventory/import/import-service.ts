/**
 * Server wiring for one ingredient import batch.
 *
 * Authorizes ONCE per batch and reuses that answer for every row — the
 * single-ingredient services re-verify on each call, which for a 25-row batch
 * with stock counts would be well over a hundred auth round trips.
 *
 * Stock counts go through `recordStockMovementWith`, never a direct insert:
 * the signed delta, the branch resolution and the low-stock / auto-86 pass all
 * live there, and an import must leave the shelf exactly as a hand-entered
 * count would.
 */

import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { recordStockMovementWith, type MovementActor } from '@/lib/inventory/stock-service'
import { applyImportBatch, type ImportDeps, type ImportRowResult } from '@/lib/inventory/import/import-apply'
import { importBatchSchema } from '@/lib/inventory/import/import-batch'
import type { InventoryItem } from '@/types/database'

const IMPORT_NOTE = 'Imported from spreadsheet'

type ServerClient = Awaited<ReturnType<typeof createClient>>

function supabaseDeps(
  supabase: ServerClient,
  tenantId: string,
  actor: MovementActor,
  outletId: string | null | undefined,
): ImportDeps {
  return {
    listUnitIds: async () => {
      const { data, error } = await supabase.from('inventory_units').select('id').eq('tenant_id', tenantId)
      if (error) throw error
      return new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
    },
    insertItem: async (input) => {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({ tenant_id: tenantId, ...input } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as InventoryItem
    },
    updateItem: async (id, patch) => {
      const { data, error } = await supabase
        .from('inventory_items')
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .maybeSingle()
      if (error) throw error
      return (data as unknown as InventoryItem | null) ?? null
    },
    recordCount: async (item, quantity) => {
      const counted = await recordStockMovementWith(
        supabase,
        tenantId,
        {
          inventory_item_id: item.id,
          reason: 'stocktake',
          quantity,
          unit_id: item.stock_unit_id,
          note: IMPORT_NOTE,
          outlet_id: outletId ?? undefined,
        },
        actor,
      )
      return counted.item
    },
  }
}

export async function importIngredientBatch(tenantId: string, rawBatch: unknown): Promise<ImportRowResult[]> {
  const { user, userRole } = await verifyTenantPermission(tenantId, 'menu')
  const batch = importBatchSchema.parse(rawBatch)

  const actor: MovementActor = {
    userId: user.id,
    scope: resolveBranchScope(userRole),
  }
  const supabase = await createClient()

  return applyImportBatch(supabaseDeps(supabase, tenantId, actor, batch.outletId), batch)
}
