/**
 * @jest-environment node
 *
 * Applying one import batch on the server.
 *
 * The browser's plan is a proposal. The server re-validates every row, refuses
 * a unit that is not this store's, never re-reads an existing ingredient's
 * stock in a new unit, and keeps going when one row fails — a bad row costs
 * that row, not the other twenty-four in its batch.
 */

import { applyImportBatch, type ImportDeps } from '@/lib/inventory/import/import-apply'
import { importBatchSchema } from '@/lib/inventory/import/import-batch'
import type { InventoryItem } from '@/types/database'

const KG = '00000000-0000-4000-8000-00000000000a'
const FOREIGN_UNIT = '00000000-0000-4000-8000-0000000000ff'
const FLOUR_ID = '00000000-0000-4000-8000-000000000001'

const baseInput = {
  name: 'Mozzarella',
  sku: null,
  category: null,
  stock_unit_id: KG,
  unit_cost: 450,
  reorder_level: 0,
  is_prep: false,
  is_active: true,
}

function toItem(id: string, input: Record<string, unknown>): InventoryItem {
  return {
    id,
    tenant_id: 't1',
    image_url: null,
    current_qty: 0,
    created_at: '',
    updated_at: '',
    ...baseInput,
    ...input,
  } as InventoryItem
}

function fakeDeps(overrides: Partial<ImportDeps> = {}) {
  const calls = { inserted: [] as unknown[], updated: [] as unknown[], counted: [] as unknown[] }
  const deps: ImportDeps = {
    listUnitIds: async () => new Set([KG]),
    insertItem: async (input) => {
      calls.inserted.push(input)
      return toItem(`new-${calls.inserted.length}`, input)
    },
    updateItem: async (id, patch) => {
      calls.updated.push({ id, patch })
      return id === FLOUR_ID ? toItem(id, patch) : null
    },
    recordCount: async (item, quantity) => {
      calls.counted.push({ id: item.id, quantity })
      return { ...item, current_qty: quantity }
    },
    ...overrides,
  }
  return { deps, calls }
}

describe('applyImportBatch', () => {
  it('creates a new ingredient and records its opening stock as a count', async () => {
    const { deps, calls } = fakeDeps()

    const results = await applyImportBatch(deps, {
      rows: [{ rowNumber: 2, existingId: null, input: baseInput, onHand: 3 }],
    })

    expect(results).toEqual([
      expect.objectContaining({ rowNumber: 2, outcome: 'created', item: expect.objectContaining({ id: 'new-1' }) }),
    ])
    expect(calls.counted).toEqual([{ id: 'new-1', quantity: 3 }])
    // The list shows the shelf AFTER the count, not the empty one it was created with.
    expect(results[0].item?.current_qty).toBe(3)
  })

  it('does not record a zero opening count for a brand-new ingredient', async () => {
    const { deps, calls } = fakeDeps()

    await applyImportBatch(deps, { rows: [{ rowNumber: 2, existingId: null, input: baseInput, onHand: 0 }] })

    expect(calls.counted).toEqual([])
  })

  it('updates an existing ingredient without touching its unit or photo', async () => {
    const { deps, calls } = fakeDeps()

    const [result] = await applyImportBatch(deps, {
      rows: [
        {
          rowNumber: 4,
          existingId: FLOUR_ID,
          input: { ...baseInput, name: 'Flour', unit_cost: 55 },
          onHand: null,
        },
      ],
    })

    expect(result.outcome).toBe('updated')
    const { patch } = calls.updated[0] as { patch: Record<string, unknown> }
    expect(patch).toMatchObject({ name: 'Flour', unit_cost: 55 })
    expect(patch).not.toHaveProperty('stock_unit_id')
    expect(patch).not.toHaveProperty('image_url')
  })

  it('fails a row whose ingredient was deleted since the file was reviewed', async () => {
    const { deps } = fakeDeps()
    const gone = '00000000-0000-4000-8000-000000000009'

    const [result] = await applyImportBatch(deps, {
      rows: [{ rowNumber: 5, existingId: gone, input: baseInput, onHand: null }],
    })

    expect(result).toMatchObject({ outcome: 'failed' })
    expect(result.error).toMatch(/no longer exists/i)
  })

  it("refuses a unit that is not this store's", async () => {
    const { deps, calls } = fakeDeps()

    const [result] = await applyImportBatch(deps, {
      rows: [{ rowNumber: 2, existingId: null, input: { ...baseInput, stock_unit_id: FOREIGN_UNIT }, onHand: null }],
    })

    expect(result.outcome).toBe('failed')
    expect(calls.inserted).toEqual([])
  })

  it('keeps going when one row fails, and hides the database error from the merchant', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    let attempt = 0
    const { deps } = fakeDeps({
      insertItem: async (input) => {
        attempt += 1
        if (attempt === 1) throw { code: '23505', message: 'duplicate key value violates constraint x' }
        return toItem('ok', input)
      },
    })

    const results = await applyImportBatch(deps, {
      rows: [
        { rowNumber: 2, existingId: null, input: baseInput, onHand: null },
        { rowNumber: 3, existingId: null, input: { ...baseInput, name: 'Basil' }, onHand: null },
      ],
    })

    expect(results.map((r) => r.outcome)).toEqual(['failed', 'created'])
    expect(results[0].error).not.toContain('constraint')
    consoleError.mockRestore()
  })

  it('keeps the ingredient and reports the count when only the stock count fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = fakeDeps({
      recordCount: async () => {
        throw new Error('ledger down')
      },
    })

    const [result] = await applyImportBatch(deps, {
      rows: [{ rowNumber: 2, existingId: null, input: baseInput, onHand: 5 }],
    })

    expect(result.outcome).toBe('created')
    expect(result.stockError).toMatch(/stock/i)
    consoleError.mockRestore()
  })

  it('returns results in the order the rows were sent', async () => {
    const { deps } = fakeDeps()
    const rows = [5, 3, 9].map((rowNumber) => ({
      rowNumber,
      existingId: null,
      input: { ...baseInput, name: `Item ${rowNumber}` },
      onHand: null,
    }))

    const results = await applyImportBatch(deps, { rows })

    expect(results.map((r) => r.rowNumber)).toEqual([5, 3, 9])
  })
})

describe('importBatchSchema', () => {
  it('refuses a negative stock count and an empty batch', () => {
    expect(
      importBatchSchema.safeParse({
        rows: [{ rowNumber: 2, existingId: null, input: baseInput, onHand: -1 }],
      }).success,
    ).toBe(false)
    expect(importBatchSchema.safeParse({ rows: [] }).success).toBe(false)
  })

  it('accepts a branch for the stock counts', () => {
    const parsed = importBatchSchema.parse({
      outletId: '00000000-0000-4000-8000-0000000000aa',
      rows: [{ rowNumber: 2, existingId: null, input: baseInput, onHand: null }],
    })

    expect(parsed.outletId).toBe('00000000-0000-4000-8000-0000000000aa')
  })
})
