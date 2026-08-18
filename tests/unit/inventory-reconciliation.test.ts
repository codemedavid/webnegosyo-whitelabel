/**
 * Stock ledger reconciliation.
 *
 * `inventory_items.current_qty` is the store-wide roll-up and
 * `inventory_stock.current_qty` is the per-branch split; a trigger keeps the
 * two in agreement, so any divergence means drift — a bug or a bypassed write —
 * that was previously invisible. This check is deliberately cheap and
 * deliberately conservative: an item with NO branch rows has never been split
 * by the trigger, so it has nothing to disagree with and is in sync by
 * definition.
 */

import {
  compareStockRollups,
  getStockReconciliationIssues,
} from '@/lib/inventory/reconciliation'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('compareStockRollups', () => {
  const item = (id: string, name: string, qty: number) => ({
    id,
    name,
    current_qty: qty,
  })
  const stockRow = (itemId: string, qty: number) => ({
    inventory_item_id: itemId,
    current_qty: qty,
  })

  it('reports nothing when every roll-up matches its branch sum', () => {
    // Arrange — 10 split 6 + 4.
    const items = [item('i1', 'Flour', 10)]
    const rows = [stockRow('i1', 6), stockRow('i1', 4)]

    // Act / Assert
    expect(compareStockRollups(items, rows)).toEqual([])
  })

  it('reports an item whose roll-up disagrees with the branch sum', () => {
    const items = [item('i1', 'Flour', 10), item('i2', 'Sugar', 5)]
    const rows = [stockRow('i1', 6), stockRow('i1', 3), stockRow('i2', 5)]

    expect(compareStockRollups(items, rows)).toEqual([
      { itemId: 'i1', name: 'Flour', rollupQty: 10, branchSumQty: 9 },
    ])
  })

  it('treats an item with no branch rows as in sync — the trigger never split it', () => {
    const items = [item('i1', 'Flour', 10)]

    expect(compareStockRollups(items, [])).toEqual([])
  })

  it('returns empty for a tenant with no items at all', () => {
    expect(compareStockRollups([], [])).toEqual([])
  })

  it('does not flag float noise as drift', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754; the comparison must not cry wolf over it.
    const items = [item('i1', 'Flour', 0.3)]
    const rows = [stockRow('i1', 0.1), stockRow('i1', 0.2)]

    expect(compareStockRollups(items, rows)).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const items = [item('i1', 'Flour', 10)]
    const rows = [stockRow('i1', 9)]
    const itemsSnapshot = structuredClone(items)
    const rowsSnapshot = structuredClone(rows)

    compareStockRollups(items, rows)

    expect(items).toEqual(itemsSnapshot)
    expect(rows).toEqual(rowsSnapshot)
  })
})

describe('getStockReconciliationIssues', () => {
  it('returns the drifted items read from both tables', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'inventory_items') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: 'i1', name: 'Flour', current_qty: 10 }],
                error: null,
              }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ inventory_item_id: 'i1', current_qty: 7 }],
              error: null,
            }),
        }),
      }
    })

    await expect(getStockReconciliationIssues('t1')).resolves.toEqual([
      { itemId: 'i1', name: 'Flour', rollupQty: 10, branchSumQty: 7 },
    ])
  })

  it('returns null when a read fails — the page must not lose the screen over it', async () => {
    from.mockImplementation(() => {
      throw new Error('connection refused')
    })

    await expect(getStockReconciliationIssues('t1')).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('returns null on a rejected query rather than throwing', async () => {
    from.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    }))

    await expect(getStockReconciliationIssues('t1')).resolves.toBeNull()
  })
})
