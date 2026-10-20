/**
 * @jest-environment node
 *
 * The ingredient import under the Phase 0d split.
 *
 * Importing ingredients stays `menu`. But a file can also carry prices (`costs`),
 * reorder levels and opening counts (`inventory`). A row asking for a grant the
 * importer lacks is REFUSED with a sentence naming the grant, never silently
 * stripped: a merchant who uploaded prices must not believe they were saved.
 * A row whose price and level are unchanged from the store's own (a re-import
 * of an export) needs nothing extra.
 */

import { importRowRefusals, IMPORT_COUNT_REFUSAL } from '@/lib/inventory/import/import-grants'
import { INGREDIENT_REFUSALS } from '@/lib/inventory/ingredient-write-grants'
import { applyImportBatch, type ImportDeps } from '@/lib/inventory/import/import-apply'
import type { ImportRowInput } from '@/lib/inventory/import/import-batch'
import type { InventoryItem } from '@/types/database'

const KG = '00000000-0000-4000-8000-00000000000a'
const FLOUR_ID = '00000000-0000-4000-8000-000000000001'

const INPUT = {
  name: 'Flour',
  sku: null,
  category: null,
  stock_unit_id: KG,
  unit_cost: 45,
  reorder_level: 10,
  is_prep: false,
  is_active: true,
}

const STORED = { ...INPUT, image_url: null }

const MENU_ONLY = { role: 'admin', is_owner: false, permissions: ['menu'] }
const OWNER = { role: 'admin', is_owner: true, permissions: [] }

function row(overrides: Partial<ImportRowInput> = {}): ImportRowInput {
  return { rowNumber: 2, existingId: null, input: INPUT, onHand: null, ...overrides }
}

describe('importRowRefusals', () => {
  test('a new ingredient with a price needs Costs & Profit', () => {
    expect(importRowRefusals(MENU_ONLY, row(), undefined)).toEqual({ save: INGREDIENT_REFUSALS.costs, count: null })
    expect(importRowRefusals(MENU_ONLY, row({ input: { ...INPUT, unit_cost: 0 } }), undefined)).toEqual({ save: null, count: null })
  })

  test('re-importing the store\'s own price and level asks for nothing extra', () => {
    expect(importRowRefusals(MENU_ONLY, row({ existingId: FLOUR_ID }), STORED)).toEqual({ save: null, count: null })
  })

  test('a changed price or reorder level asks for its own grant', () => {
    expect(importRowRefusals(MENU_ONLY, row({ existingId: FLOUR_ID, input: { ...INPUT, unit_cost: 50 } }), STORED).save)
      .toBe(INGREDIENT_REFUSALS.costs)
    expect(importRowRefusals(MENU_ONLY, row({ existingId: FLOUR_ID, input: { ...INPUT, reorder_level: 2 } }), STORED).save)
      .toBe(INGREDIENT_REFUSALS.inventory)
  })

  test('the unit is never part of an update, so it never asks for a grant', () => {
    const otherUnit = { ...INPUT, stock_unit_id: '00000000-0000-4000-8000-0000000000bb' }
    expect(importRowRefusals(MENU_ONLY, row({ existingId: FLOUR_ID, input: otherUnit }), STORED).save).toBeNull()
  })

  test('an opening count needs Inventory', () => {
    expect(importRowRefusals(MENU_ONLY, row({ existingId: FLOUR_ID, onHand: 3 }), STORED)).toEqual({ save: null, count: IMPORT_COUNT_REFUSAL })
  })

  test('the owner is refused nothing', () => {
    expect(importRowRefusals(OWNER, row({ onHand: 3 }), undefined)).toEqual({ save: null, count: null })
  })
})

describe('applyImportBatch with refusals', () => {
  function fakeDeps(refusals: ImportDeps['rowRefusals']) {
    const calls = { inserted: 0, updated: 0, counted: 0 }
    const item = { id: FLOUR_ID, current_qty: 0, ...STORED } as unknown as InventoryItem
    const deps: ImportDeps = {
      listUnitIds: async () => new Set([KG]),
      insertItem: async () => {
        calls.inserted += 1
        return item
      },
      updateItem: async () => {
        calls.updated += 1
        return item
      },
      recordCount: async () => {
        calls.counted += 1
        return item
      },
      rowRefusals: refusals,
    }
    return { deps, calls }
  }

  test('a refused row fails with the reason and writes nothing', async () => {
    const { deps, calls } = fakeDeps(() => ({ save: INGREDIENT_REFUSALS.costs, count: null }))

    const [result] = await applyImportBatch(deps, { rows: [row()] })

    expect(result).toEqual({ rowNumber: 2, outcome: 'failed', error: INGREDIENT_REFUSALS.costs })
    expect(calls).toEqual({ inserted: 0, updated: 0, counted: 0 })
  })

  test('a refused count still saves the ingredient and says why the count did not', async () => {
    const { deps, calls } = fakeDeps(() => ({ save: null, count: IMPORT_COUNT_REFUSAL }))

    const [result] = await applyImportBatch(deps, { rows: [row({ existingId: FLOUR_ID, onHand: 3 })] })

    expect(result).toMatchObject({ outcome: 'updated', stockError: IMPORT_COUNT_REFUSAL })
    expect(calls.counted).toBe(0)
  })
})
