/**
 * Per-item sales aggregation for the MCP's menu-engineering surface.
 *
 * The platform stores a tenant's orders in one of THREE backends (platform
 * Supabase, the tenant's own Supabase project, or the tenant's own Convex
 * deployment). Every one of them is normalized into the same `ItemSalesRow`
 * before it reaches this module, so the arithmetic below is the single place
 * "how popular is this item" is decided — and the only place that has to be
 * right.
 *
 * The tests that matter most here are the ones about ABSENCE. A tenant whose
 * orders live in Convex, read through the platform database, returns zero rows;
 * if that renders as "every item sold 0" the AI will confidently classify the
 * entire menu as dogs and tell the merchant to delete it. So an empty read must
 * be distinguishable from a real zero, and a partial read must say so.
 */

import {
  aggregateItemSales,
  buildMenuPerformance,
  convexTopItemsToRows,
  platformOrderItemsToRows,
  type ItemSalesRow,
} from '@/lib/queries/menu-performance-merge'

function row(over: Partial<ItemSalesRow> = {}): ItemSalesRow {
  return { menuItemId: 'item-1', name: 'Latte', quantity: 1, revenue: 100, ...over }
}

describe('aggregateItemSales', () => {
  it('sums units and revenue for the same item across many order lines', () => {
    // Arrange
    const rows = [
      row({ quantity: 2, revenue: 200 }),
      row({ quantity: 3, revenue: 300 }),
    ]

    // Act
    const result = aggregateItemSales(rows)

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ itemId: 'item-1', units: 5, revenue: 500 })
  })

  it('keeps different items apart and sorts them by revenue, highest first', () => {
    const rows = [
      row({ menuItemId: 'a', name: 'Cheap', quantity: 10, revenue: 100 }),
      row({ menuItemId: 'b', name: 'Pricey', quantity: 1, revenue: 900 }),
    ]

    const result = aggregateItemSales(rows)

    expect(result.map((r) => r.itemId)).toEqual(['b', 'a'])
  })

  it('reports each item its share of total units and total revenue', () => {
    const rows = [
      row({ menuItemId: 'a', quantity: 3, revenue: 750 }),
      row({ menuItemId: 'b', quantity: 1, revenue: 250 }),
    ]

    const result = aggregateItemSales(rows)

    const a = result.find((r) => r.itemId === 'a')!
    expect(a.unitShare).toBeCloseTo(0.75)
    expect(a.revenueShare).toBeCloseTo(0.75)
  })

  it('groups by name when the menu item was deleted and its id is null', () => {
    // A deleted menu item leaves order_items.menu_item_id null (on delete set
    // null). Those lines are still real sales and must not all collapse into one
    // phantom "null" item.
    const rows = [
      row({ menuItemId: null, name: 'Retired Mocha', quantity: 2, revenue: 200 }),
      row({ menuItemId: null, name: 'Retired Mocha', quantity: 1, revenue: 100 }),
      row({ menuItemId: null, name: 'Retired Tea', quantity: 5, revenue: 250 }),
    ]

    const result = aggregateItemSales(rows)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.name === 'Retired Mocha')).toMatchObject({ units: 3, revenue: 300 })
  })

  it('returns no shares rather than dividing by zero when nothing sold', () => {
    const rows = [row({ quantity: 0, revenue: 0 })]

    const result = aggregateItemSales(rows)

    expect(result[0].unitShare).toBe(0)
    expect(result[0].revenueShare).toBe(0)
  })

  it('returns an empty list for an empty read', () => {
    expect(aggregateItemSales([])).toEqual([])
  })
})

describe('buildMenuPerformance', () => {
  it('marks a complete read as complete and totals the window', () => {
    const result = buildMenuPerformance({
      dataSource: 'platform',
      windowDays: 30,
      rows: [row({ quantity: 4, revenue: 400 })],
    })

    expect(result.dataSource).toBe('platform')
    expect(result.windowDays).toBe(30)
    expect(result.totalUnits).toBe(4)
    expect(result.totalRevenue).toBe(400)
    expect(result.coverage.complete).toBe(true)
  })

  it('says an empty window is empty instead of implying every item sold nothing', () => {
    // THE bug this module exists to prevent: silence read as data.
    const result = buildMenuPerformance({ dataSource: 'convex', windowDays: 30, rows: [] })

    expect(result.items).toEqual([])
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/no order data/i)
  })

  it('flags a truncated read so the caller knows the tail is missing', () => {
    const result = buildMenuPerformance({
      dataSource: 'convex',
      windowDays: 30,
      rows: [row()],
      truncated: true,
    })

    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/truncated|partial/i)
  })

  it('reports the backend that answered, so a Convex tenant is never read as a platform tenant', () => {
    const result = buildMenuPerformance({
      dataSource: 'tenant_supabase',
      windowDays: 7,
      rows: [row()],
    })

    expect(result.dataSource).toBe('tenant_supabase')
  })
})

describe('convexTopItemsToRows', () => {
  it('normalizes the deployed getTopItems shape', () => {
    // Shape is fixed by convex-template/convex/analytics.ts:getTopItems, which
    // is already deployed to every tenant — this must match it, not a nicer
    // shape we would have preferred.
    const rows = convexTopItemsToRows([
      { itemId: 'x', name: 'Sisig', count: 7, revenue: 1400 },
    ])

    expect(rows).toEqual([{ menuItemId: 'x', name: 'Sisig', quantity: 7, revenue: 1400 }])
  })

  it('survives a malformed row from an older deployment without throwing', () => {
    const rows = convexTopItemsToRows([{ itemId: 'x' }, null, undefined] as unknown[])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ menuItemId: 'x', quantity: 0, revenue: 0 })
  })
})

describe('platformOrderItemsToRows', () => {
  it('normalizes the joined order_items shape', () => {
    const rows = platformOrderItemsToRows([
      { menu_item_id: 'y', menu_item_name: 'Adobo', quantity: 2, subtotal: 300 },
    ])

    expect(rows).toEqual([{ menuItemId: 'y', name: 'Adobo', quantity: 2, revenue: 300 }])
  })

  it('reads a numeric column that PostgREST returned as a string', () => {
    // numeric(10,2) arrives as a string over PostgREST; summing those with + would
    // concatenate revenue instead of adding it.
    const rows = platformOrderItemsToRows([
      { menu_item_id: 'y', menu_item_name: 'Adobo', quantity: 2, subtotal: '300.50' },
    ])

    expect(rows[0].revenue).toBeCloseTo(300.5)
  })

  it('keeps a line whose menu item has since been deleted', () => {
    const rows = platformOrderItemsToRows([
      { menu_item_id: null, menu_item_name: 'Gone', quantity: 1, subtotal: 50 },
    ])

    expect(rows[0]).toMatchObject({ menuItemId: null, name: 'Gone' })
  })
})
