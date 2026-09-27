import {
  buildAuditLines,
  describeAuditEntry,
  formatAuditLineQuantity,
  resolveAuditFilters,
  summarizeAuditEntries,
  isSuspectedDuplicateMovement,
  parseStockAuditSource,
  truncateAuditDetail,
  SUSPECTED_DUPLICATE_WINDOW_MS,
  type StockAuditEntryView,
} from '@/lib/inventory/stock-audit'

describe('parseStockAuditSource', () => {
  test('accepts every known source', () => {
    for (const source of ['web_checkout', 'customer_app', 'pos', 'qr_scan', 'merchant_app', 'web_admin', 'system']) {
      expect(parseStockAuditSource(source, 'system')).toBe(source)
    }
  })

  test('falls back for anything a client invents', () => {
    expect(parseStockAuditSource('hacker', 'merchant_app')).toBe('merchant_app')
    expect(parseStockAuditSource(undefined, 'merchant_app')).toBe('merchant_app')
    expect(parseStockAuditSource(42, 'pos')).toBe('pos')
  })
})

describe('buildAuditLines', () => {
  test('names each ingredient and keeps the signed delta', () => {
    const lines = buildAuditLines(
      [
        { inventory_item_id: 'rice', quantity_delta: -200, entered_quantity: 200, entered_unit_id: 'g' },
        { inventory_item_id: 'egg', quantity_delta: -1, entered_quantity: 1, entered_unit_id: 'pc' },
      ],
      new Map([['rice', 'Rice']]),
    )

    expect(lines).toEqual([
      { inventoryItemId: 'rice', name: 'Rice', quantityDelta: -200, enteredQuantity: 200, enteredUnitId: 'g' },
      // An ingredient whose name could not be read keeps its id, never vanishes.
      { inventoryItemId: 'egg', name: null, quantityDelta: -1, enteredQuantity: 1, enteredUnitId: 'pc' },
    ])
  })

  test('coerces numeric strings from PostgREST numeric columns', () => {
    const [line] = buildAuditLines(
      [{ inventory_item_id: 'rice', quantity_delta: '-0.5' as unknown as number, entered_quantity: null, entered_unit_id: null }],
      new Map(),
    )
    expect(line.quantityDelta).toBe(-0.5)
    expect(line.enteredQuantity).toBeNull()
  })
})

describe('isSuspectedDuplicateMovement', () => {
  const now = Date.parse('2026-09-26T10:00:00Z')
  const candidate = {
    inventoryItemId: 'rice',
    reason: 'waste',
    enteredQuantity: 500,
    enteredUnitId: 'g',
    outletId: null,
    actorUserId: 'user-1',
  }
  const recent = (overrides: Record<string, unknown> = {}) => ({
    inventory_item_id: 'rice',
    reason: 'waste',
    entered_quantity: 500,
    entered_unit_id: 'g',
    outlet_id: null,
    created_by: 'user-1',
    created_at: new Date(now - 60_000).toISOString(),
    ...overrides,
  })

  test('flags the same movement by the same person a minute ago', () => {
    expect(isSuspectedDuplicateMovement(candidate, [recent()], now)).toBe(true)
  })

  test('ignores an identical movement outside the window', () => {
    const old = recent({ created_at: new Date(now - SUSPECTED_DUPLICATE_WINDOW_MS - 1).toISOString() })
    expect(isSuspectedDuplicateMovement(candidate, [old], now)).toBe(false)
  })

  test.each([
    ['a different quantity', { entered_quantity: 400 }],
    ['a different reason', { reason: 'receive' }],
    ['a different unit', { entered_unit_id: 'kg' }],
    ['a different branch', { outlet_id: 'north' }],
    ['a different person', { created_by: 'user-2' }],
    ['a different ingredient', { inventory_item_id: 'egg' }],
  ])('does not flag %s', (_label, overrides) => {
    expect(isSuspectedDuplicateMovement(candidate, [recent(overrides)], now)).toBe(false)
  })

  test('never flags an unattributed movement — nobody to have repeated it', () => {
    expect(
      isSuspectedDuplicateMovement({ ...candidate, actorUserId: null }, [recent({ created_by: null })], now),
    ).toBe(false)
  })

  test('matches numeric strings against numbers', () => {
    expect(isSuspectedDuplicateMovement(candidate, [recent({ entered_quantity: '500.0000' })], now)).toBe(true)
  })
})

describe('truncateAuditDetail', () => {
  test('keeps short messages and caps long ones under the column limit', () => {
    expect(truncateAuditDetail('boom')).toBe('boom')
    expect(truncateAuditDetail('x'.repeat(5000))).toHaveLength(2000)
    expect(truncateAuditDetail(undefined)).toBeNull()
    expect(truncateAuditDetail('  ')).toBeNull()
  })
})

describe('describeAuditEntry', () => {
  const base: StockAuditEntryView = {
    event: 'order_sale',
    outcome: 'applied',
    source: 'pos',
    orderId: 'abc123def456',
    revision: 0,
    movementCount: 2,
    isSuspectedDuplicate: false,
    actorName: 'Maria',
    detail: null,
  }

  test('an applied sale names the path and the person', () => {
    expect(describeAuditEntry(base)).toEqual({
      title: 'Deducted for order …def456',
      subtitle: 'Register · Maria',
      tone: 'neutral',
    })
  })

  test('a refused duplicate is a warning that says nothing was deducted', () => {
    const view = describeAuditEntry({ ...base, outcome: 'duplicate', movementCount: 0 })
    expect(view.tone).toBe('warning')
    expect(view.title).toBe('Second deduction refused for order …def456')
  })

  test('a failure is an error and carries the detail', () => {
    const view = describeAuditEntry({ ...base, outcome: 'failed', movementCount: 0, detail: 'timeout' })
    expect(view.tone).toBe('error')
    expect(view.subtitle).toContain('timeout')
  })

  test('a suspected duplicate manual movement is a warning', () => {
    const view = describeAuditEntry({
      ...base,
      event: 'manual_movement',
      orderId: null,
      source: 'merchant_app',
      isSuspectedDuplicate: true,
    })
    expect(view.tone).toBe('warning')
    expect(view.title).toBe('Manual stock change — same as one recorded minutes ago')
  })

  test('no actor renders the source alone, never "Unknown"', () => {
    const view = describeAuditEntry({ ...base, source: 'web_checkout', actorName: null })
    expect(view.subtitle).toBe('Online checkout')
  })

  test('an edit names its revision', () => {
    expect(describeAuditEntry({ ...base, event: 'order_edit', revision: 2 }).title).toBe(
      'Edit #2 adjusted order …def456',
    )
  })
})


describe('resolveAuditFilters', () => {
  test('reads an order search and the problems view', () => {
    expect(resolveAuditFilters({ order: ' def456 ', view: 'problems' })).toEqual({
      orderQuery: 'def456',
      problemsOnly: true,
    })
  })

  test('drops characters that would act as wildcards or break the filter', () => {
    expect(resolveAuditFilters({ order: '%_,()*abc-12' }).orderQuery).toBe('abc-12')
  })

  test('never throws on junk and defaults to everything', () => {
    expect(resolveAuditFilters({ order: ['a', 'b'], view: 'nope' })).toEqual({ orderQuery: null, problemsOnly: false })
    expect(resolveAuditFilters({})).toEqual({ orderQuery: null, problemsOnly: false })
  })

  test('caps a pasted essay', () => {
    expect(resolveAuditFilters({ order: 'a'.repeat(500) }).orderQuery).toHaveLength(64)
  })
})

describe('summarizeAuditEntries', () => {
  test('counts what a merchant needs to look at', () => {
    const summary = summarizeAuditEntries([
      { event: 'order_sale', outcome: 'applied', isSuspectedDuplicate: false },
      { event: 'order_sale', outcome: 'applied', isSuspectedDuplicate: false },
      { event: 'order_sale', outcome: 'duplicate', isSuspectedDuplicate: false },
      { event: 'order_restore', outcome: 'applied', isSuspectedDuplicate: false },
      { event: 'manual_movement', outcome: 'applied', isSuspectedDuplicate: true },
      { event: 'order_sale', outcome: 'failed', isSuspectedDuplicate: false },
    ])
    expect(summary).toEqual({ deductions: 2, restores: 1, duplicatesRefused: 1, suspectedRepeats: 1, failures: 1 })
  })
})

describe('formatAuditLineQuantity', () => {
  test('signs the stock-unit figure so a deduction reads as one', () => {
    expect(formatAuditLineQuantity(-200, 'g')).toBe('−200 g')
    expect(formatAuditLineQuantity(1.5, 'kg')).toBe('+1.5 kg')
  })

  test('trims float noise and survives a missing unit', () => {
    expect(formatAuditLineQuantity(-0.30000000000000004, null)).toBe('−0.3')
    expect(formatAuditLineQuantity(0, 'g')).toBe('0 g')
  })
})
