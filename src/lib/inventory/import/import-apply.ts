/**
 * Applying one import batch, against injected storage.
 *
 * Each row stands alone: a failure is recorded against its row number and the
 * batch carries on, so one bad line costs that line and nothing else. The
 * merchant is shown a plain sentence; the database's own words go to the
 * server log, which is the only place an internal constraint name belongs.
 *
 * Storage is injected so these rules are tested without a database. The
 * Supabase wiring lives in `import-service.ts`.
 */

import type { ImportBatchInput, ImportRowInput } from '@/lib/inventory/import/import-batch'
import type { InventoryItem } from '@/types/database'

/** What an update may change. Never the unit (it would re-read every quantity) or the photo. */
export type IngredientPatch = Omit<ImportRowInput['input'], 'stock_unit_id'>

export interface ImportDeps {
  /** The store's own units — the only ones a row may name. */
  listUnitIds: () => Promise<ReadonlySet<string>>
  insertItem: (input: ImportRowInput['input']) => Promise<InventoryItem>
  /** Null when no ingredient of this store has that id any more. */
  updateItem: (id: string, patch: IngredientPatch) => Promise<InventoryItem | null>
  /** Records a stock count, in the item's own unit; returns the item after it. */
  recordCount: (item: InventoryItem, quantity: number) => Promise<InventoryItem>
}

export type ImportRowOutcome = 'created' | 'updated' | 'failed'

export interface ImportRowResult {
  rowNumber: number
  outcome: ImportRowOutcome
  item?: InventoryItem
  /** Why the row was not saved. */
  error?: string
  /** The ingredient saved but its stock count did not. */
  stockError?: string
}

/** Rows written at once. The trigger serializes per item, so rows never contend. */
const ROW_CONCURRENCY = 4

const SAVE_FAILED = 'We couldn’t save this row. Try importing it again.'
const STOCK_FAILED = 'Saved, but its stock count wasn’t recorded. Add it with Adjust stock.'

async function mapInOrder<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function toPatch(input: ImportRowInput['input']): IngredientPatch {
  return {
    name: input.name,
    sku: input.sku,
    category: input.category,
    unit_cost: input.unit_cost,
    reorder_level: input.reorder_level,
    is_prep: input.is_prep,
    is_active: input.is_active,
  }
}

async function saveRow(deps: ImportDeps, row: ImportRowInput): Promise<{ item: InventoryItem | null; outcome: ImportRowOutcome }> {
  if (row.existingId) {
    const item = await deps.updateItem(row.existingId, toPatch(row.input))
    return { item, outcome: 'updated' }
  }
  return { item: await deps.insertItem(row.input), outcome: 'created' }
}

async function applyRow(deps: ImportDeps, unitIds: ReadonlySet<string>, row: ImportRowInput): Promise<ImportRowResult> {
  // Only a new row's unit is ever written; an update keeps the stored one.
  if (!row.existingId && !unitIds.has(row.input.stock_unit_id)) {
    return { rowNumber: row.rowNumber, outcome: 'failed', error: 'That unit isn’t one of your units any more.' }
  }

  let saved: { item: InventoryItem | null; outcome: ImportRowOutcome }
  try {
    saved = await saveRow(deps, row)
  } catch (error) {
    console.error('[inventory-import] row save failed', { rowNumber: row.rowNumber, error })
    return { rowNumber: row.rowNumber, outcome: 'failed', error: SAVE_FAILED }
  }
  if (!saved.item) {
    return { rowNumber: row.rowNumber, outcome: 'failed', error: 'This ingredient no longer exists.' }
  }

  const result: ImportRowResult = { rowNumber: row.rowNumber, outcome: saved.outcome, item: saved.item }
  // A new ingredient starts at zero, so an opening count of zero moves nothing.
  const needsCount = row.onHand !== null && (row.existingId !== null || row.onHand > 0)
  if (!needsCount) return result

  try {
    return { ...result, item: await deps.recordCount(saved.item, row.onHand as number) }
  } catch (error) {
    console.error('[inventory-import] stock count failed', { rowNumber: row.rowNumber, error })
    return { ...result, stockError: STOCK_FAILED }
  }
}

export async function applyImportBatch(
  deps: ImportDeps,
  batch: Pick<ImportBatchInput, 'rows'>,
): Promise<ImportRowResult[]> {
  const unitIds = await deps.listUnitIds()
  return mapInOrder(batch.rows, ROW_CONCURRENCY, (row) => applyRow(deps, unitIds, row))
}
