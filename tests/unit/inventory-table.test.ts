/**
 * The inventory table view model.
 *
 * The redesigned inventory screen is a data table — search, sort, paginate,
 * export — and every one of those decisions is a pure function of the rows.
 * Keeping them here means the table component only renders, and the merchant
 * app can grow the same table from the same rules.
 */

import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import {
  buildInventoryCsv,
  buildInventoryRows,
  filterInventoryRows,
  paginateRows,
  sortInventoryRows,
  toLastPurchaseMap,
  toggleSelected,
  toggleAllSelected,
  type InventoryRow,
} from '@/lib/inventory/inventory-table'

const KG: InventoryUnitRow = {
  id: 'unit-kg',
  tenant_id: 't1',
  name: 'Kilogram',
  abbreviation: 'kg',
  dimension: 'weight',
  to_base_factor: 1000,
  is_base: false,
  is_active: true,
  created_at: '',
  updated_at: '',
}

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    tenant_id: 't1',
    name: 'Broccoli',
    sku: 'V01456',
    category: 'Vegetable',
    stock_unit_id: KG.id,
    unit_cost: 12,
    is_prep: false,
    image_url: null,
    current_qty: 10,
    reorder_level: 0,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const CONTEXT = {
  unitAbbreviation: (unitId: string) => (unitId === KG.id ? 'kg' : ''),
  lastPurchaseAt: new Map<string, string>(),
}

describe('buildInventoryRows', () => {
  it('projects an ingredient into the columns the table renders', () => {
    // Arrange
    const items = [item({ id: 'i1', current_qty: 10 })]

    // Act
    const [row] = buildInventoryRows(items, CONTEXT)

    // Assert
    expect(row).toMatchObject({
      id: 'i1',
      code: 'V01456',
      name: 'Broccoli',
      group: 'Vegetable',
      onHandLabel: '10 kg',
      onHandQty: 10,
      stockLevel: 'ok',
      lastPurchaseAt: null,
    })
  })

  it('falls back to a placeholder code and group when the merchant left them blank', () => {
    const [row] = buildInventoryRows([item({ sku: null, category: null })], CONTEXT)

    expect(row.code).toBe('—')
    expect(row.group).toBe('Uncategorized')
  })

  it('trims the trailing zeros a NUMERIC round-trip leaves on the on-hand figure', () => {
    const [row] = buildInventoryRows([item({ current_qty: 4.5 })], CONTEXT)

    expect(row.onHandLabel).toBe('4.5 kg')
  })

  it('flags an ingredient at or below its reorder level as low so the row can warn', () => {
    const [row] = buildInventoryRows([item({ current_qty: 1, reorder_level: 5 })], CONTEXT)

    expect(row.stockLevel).toBe('low')
  })

  it('carries the last purchase date through for the items that have one', () => {
    const lastPurchaseAt = new Map([['i1', '2026-05-03T00:00:00.000Z']])

    const [row] = buildInventoryRows([item({ id: 'i1' })], { ...CONTEXT, lastPurchaseAt })

    expect(row.lastPurchaseAt).toBe('2026-05-03T00:00:00.000Z')
  })
})

describe('toLastPurchaseMap', () => {
  it('keeps the most recent receive per ingredient', () => {
    const map = toLastPurchaseMap([
      { inventory_item_id: 'i1', created_at: '2026-05-01T00:00:00.000Z' },
      { inventory_item_id: 'i1', created_at: '2026-05-04T00:00:00.000Z' },
      { inventory_item_id: 'i2', created_at: '2026-05-02T00:00:00.000Z' },
    ])

    expect(map.get('i1')).toBe('2026-05-04T00:00:00.000Z')
    expect(map.get('i2')).toBe('2026-05-02T00:00:00.000Z')
  })

  it('returns an empty map when nothing was ever received', () => {
    expect(toLastPurchaseMap([]).size).toBe(0)
  })
})

describe('filterInventoryRows', () => {
  const rows = buildInventoryRows(
    [
      item({ id: 'i1', name: 'Broccoli', sku: 'V01456', category: 'Vegetable' }),
      item({ id: 'i2', name: 'Chicken', sku: 'M01461', category: 'Meat' }),
    ],
    CONTEXT,
  )

  it('returns every row for an empty query', () => {
    expect(filterInventoryRows(rows, '   ')).toHaveLength(2)
  })

  it('matches on name regardless of case', () => {
    expect(filterInventoryRows(rows, 'chick').map((r) => r.id)).toEqual(['i2'])
  })

  it('matches on item code', () => {
    expect(filterInventoryRows(rows, 'v0145').map((r) => r.id)).toEqual(['i1'])
  })

  it('matches on item group', () => {
    expect(filterInventoryRows(rows, 'meat').map((r) => r.id)).toEqual(['i2'])
  })

  it('returns nothing when no row matches', () => {
    expect(filterInventoryRows(rows, 'zzz')).toEqual([])
  })

  it('leaves the input array untouched', () => {
    const before = [...rows]
    filterInventoryRows(rows, 'chick')
    expect(rows).toEqual(before)
  })
})

describe('sortInventoryRows', () => {
  const rows = buildInventoryRows(
    [
      item({ id: 'i1', name: 'Broccoli', category: 'Vegetable', current_qty: 10 }),
      item({ id: 'i2', name: 'Chicken', category: 'Meat', current_qty: 56 }),
      item({ id: 'i3', name: 'Aubergine', category: 'Vegetable', current_qty: 8 }),
    ],
    {
      ...CONTEXT,
      lastPurchaseAt: new Map([
        ['i1', '2026-05-03T00:00:00.000Z'],
        ['i2', '2026-05-02T00:00:00.000Z'],
      ]),
    },
  )

  it('sorts by name ascending', () => {
    expect(sortInventoryRows(rows, 'name', 'asc').map((r) => r.id)).toEqual(['i3', 'i1', 'i2'])
  })

  it('sorts by name descending', () => {
    expect(sortInventoryRows(rows, 'name', 'desc').map((r) => r.id)).toEqual(['i2', 'i1', 'i3'])
  })

  it('sorts by group', () => {
    expect(sortInventoryRows(rows, 'group', 'asc')[0].group).toBe('Meat')
  })

  it('sorts by on-hand quantity numerically rather than as text', () => {
    expect(sortInventoryRows(rows, 'onHand', 'asc').map((r) => r.onHandQty)).toEqual([8, 10, 56])
  })

  it('sorts never-purchased items last whichever way the date column is sorted', () => {
    expect(sortInventoryRows(rows, 'lastPurchase', 'asc').map((r) => r.id)).toEqual([
      'i2',
      'i1',
      'i3',
    ])
    expect(sortInventoryRows(rows, 'lastPurchase', 'desc').map((r) => r.id)).toEqual([
      'i1',
      'i2',
      'i3',
    ])
  })

  it('returns a new array rather than sorting in place', () => {
    const order = rows.map((r) => r.id)
    sortInventoryRows(rows, 'name', 'desc')
    expect(rows.map((r) => r.id)).toEqual(order)
  })
})

describe('paginateRows', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: `i${i}` })) as InventoryRow[]

  it('returns the requested page and a human summary of it', () => {
    const page = paginateRows(rows, 2, 10)

    expect(page.rows.map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `i${i + 10}`),
    )
    expect(page).toMatchObject({ page: 2, pageCount: 3, from: 11, to: 20, total: 23 })
  })

  it('reports a short final page honestly', () => {
    expect(paginateRows(rows, 3, 10)).toMatchObject({ from: 21, to: 23, rows: expect.any(Array) })
  })

  it('clamps a page beyond the end back to the last page', () => {
    expect(paginateRows(rows, 99, 10).page).toBe(3)
  })

  it('clamps a page below one back to the first page', () => {
    expect(paginateRows(rows, 0, 10).page).toBe(1)
  })

  it('reports an empty result without pretending there is a row on it', () => {
    expect(paginateRows([], 1, 10)).toMatchObject({
      rows: [],
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
      total: 0,
    })
  })
})

describe('selection', () => {
  it('adds an unselected id and removes a selected one', () => {
    expect(toggleSelected([], 'i1')).toEqual(['i1'])
    expect(toggleSelected(['i1', 'i2'], 'i1')).toEqual(['i2'])
  })

  it('does not mutate the selection it is given', () => {
    const selected = ['i1']
    toggleSelected(selected, 'i2')
    expect(selected).toEqual(['i1'])
  })

  it('selects every visible id when none of them are selected', () => {
    expect(toggleAllSelected([], ['i1', 'i2'])).toEqual(['i1', 'i2'])
  })

  it('clears only the visible ids, keeping selections made on other pages', () => {
    expect(toggleAllSelected(['i1', 'i2', 'i9'], ['i1', 'i2'])).toEqual(['i9'])
  })

  it('completes a partial selection rather than clearing it', () => {
    expect(toggleAllSelected(['i1'], ['i1', 'i2'])).toEqual(['i1', 'i2'])
  })
})

describe('buildInventoryCsv', () => {
  const rows = buildInventoryRows(
    [item({ id: 'i1', name: 'Broccoli', current_qty: 10 })],
    { ...CONTEXT, lastPurchaseAt: new Map([['i1', '2026-05-03T00:00:00.000Z']]) },
  )

  it('writes a header and one line per row', () => {
    const csv = buildInventoryCsv(rows)

    expect(csv.split('\n')).toEqual([
      'SKU,Name,Category,Last Purchase,On Hand',
      'V01456,Broccoli,Vegetable,2026-05-03,10 kg',
    ])
  })

  it('quotes a field containing a comma so the column count survives', () => {
    const withComma = buildInventoryCsv(
      buildInventoryRows([item({ name: 'Salt, coarse' })], CONTEXT),
    )

    expect(withComma).toContain('"Salt, coarse"')
  })

  it('escapes embedded quotes', () => {
    const withQuote = buildInventoryCsv(buildInventoryRows([item({ name: 'Beef "prime"' })], CONTEXT))

    expect(withQuote).toContain('"Beef ""prime"""')
  })

  it('leaves the last purchase cell empty when the item was never received', () => {
    const csv = buildInventoryCsv(buildInventoryRows([item({ id: 'i9' })], CONTEXT))

    expect(csv.split('\n')[1]).toContain(',,')
  })
})
