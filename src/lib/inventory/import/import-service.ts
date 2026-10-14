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
import { importBatchSchema, type ImportBatchInput } from '@/lib/inventory/import/import-batch'
import { importRowRefusals } from '@/lib/inventory/import/import-grants'
import type { StoredIngredient } from '@/lib/inventory/ingredient-write-grants'
import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'
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

const STORED_COLUMNS = 'id, name, sku, category, stock_unit_id, unit_cost, is_prep, image_url, reorder_level, is_active'

/**
 * The rows this batch updates, as stored — only read when the importer lacks
 * `costs` or `inventory`, since only then can a changed price or level be
 * refused. One read per batch.
 */
async function readStoredRows(
  supabase: ServerClient,
  tenantId: string,
  holder: PermissionHolder,
  batch: ImportBatchInput,
): Promise<ReadonlyMap<string, StoredIngredient>> {
  const ids = batch.rows.flatMap((row) => (row.existingId ? [row.existingId] : []))
  const holdsAll = hasPermission(holder, 'costs') && hasPermission(holder, 'inventory')
  if (holdsAll || ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('inventory_items')
    .select(STORED_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<StoredIngredient & { id: string }>
  return new Map(rows.map((row) => [row.id, row]))
}

export async function importIngredientBatch(tenantId: string, rawBatch: unknown): Promise<ImportRowResult[]> {
  const { user, userRole } = await verifyTenantPermission(tenantId, 'menu', 'create')
  const batch = importBatchSchema.parse(rawBatch)

  const actor: MovementActor = {
    userId: user.id,
    scope: resolveBranchScope(userRole),
  }
  const supabase = await createClient()
  const stored = await readStoredRows(supabase, tenantId, userRole, batch)

  return applyImportBatch(
    {
      ...supabaseDeps(supabase, tenantId, actor, batch.outletId),
      rowRefusals: (row) => importRowRefusals(userRole, row, row.existingId ? stored.get(row.existingId) : undefined),
    },
    batch,
  )
}
