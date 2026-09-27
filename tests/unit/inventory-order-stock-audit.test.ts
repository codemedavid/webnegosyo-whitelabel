/**
 * Every order-driven stock operation leaves an audit row — including the ones
 * that write nothing.
 *
 * The case that mattered: a second depletion of the same order is refused by
 * the claim and used to leave NO trace, so a merchant's "stock was deducted
 * twice" could not be confirmed or refuted from the database. Now the refusal
 * is a row naming the path and the person that tried.
 */

import {
  applyOrderRevisionStockBestEffort,
  applyOrderStockBestEffort,
  applyOrderStockMovements,
  reverseOrderStockBestEffort,
} from '@/lib/inventory/order-stock-service'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-audit-1'
const FLOUR = 'item-flour'
const GRAM = 'unit-gram'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a), rpc: async () => ({ data: 0, error: null }) }),
}))
jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() => Promise.resolve({})),
}))
jest.mock('@/lib/inventory/stock-failure-report', () => ({ reportStockFailure: jest.fn() }))

const DATA: Record<string, unknown[]> = {
  recipes: [{ id: 'rec-1', tenant_id: TENANT, menu_item_id: 'menu-1', target_type: 'menu_item' }],
  recipe_components: [
    { id: 'c1', tenant_id: TENANT, recipe_id: 'rec-1', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 100 },
  ],
  inventory_items: [{ id: FLOUR, tenant_id: TENANT, name: 'Flour', stock_unit_id: GRAM, current_qty: 1000 }],
  inventory_units: [{ id: GRAM, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }],
  stock_movements: [],
}

interface StubOptions {
  claimTaken?: boolean
  claims?: unknown[]
  noRecipes?: boolean
  movements?: unknown[]
  failRecipes?: boolean
}

function stub(options: StubOptions, audits: Record<string, unknown>[]) {
  from.mockImplementation((table: string) => {
    if (table === 'inventory_audit_log') {
      return { insert: (row: Record<string, unknown>) => (audits.push(row), Promise.resolve({ error: null })) }
    }
    if (table === 'order_stock_applications') {
      const chain = {
        eq: () => chain,
        then: (resolve: (r: unknown) => unknown) => resolve({ data: options.claims ?? [], error: null }),
      }
      return {
        select: () => chain,
        insert: () =>
          Promise.resolve({ error: options.claimTaken ? { code: '23505', message: 'dup' } : null }),
        delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }) }),
      }
    }
    const rows = () => {
      if (table === 'recipes' && options.noRecipes) return []
      if (table === 'stock_movements') return options.movements ?? []
      return DATA[table] ?? []
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (resolve: (r: unknown) => unknown) =>
        resolve(
          table === 'recipes' && options.failRecipes
            ? { data: null, error: { message: 'recipes unreadable' } }
            : { data: rows(), error: null },
        ),
      insert: () => Promise.resolve({ error: null }),
    }
    return chain
  })
}

const ITEMS = [{ menuItemId: 'menu-1', quantity: 2 }]

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('applyOrderStockMovements reports its outcome', () => {
  test('a won claim that writes rows is applied, with named lines', async () => {
    stub({}, [])
    const result = await applyOrderStockMovements(TENANT, ORDER, ITEMS, 'sale')
    expect(result.outcome).toBe('applied')
    expect(result.lines).toEqual([
      { inventoryItemId: FLOUR, name: 'Flour', quantityDelta: -200, enteredQuantity: 200, enteredUnitId: GRAM },
    ])
  })

  test('a lost claim is a duplicate', async () => {
    stub({ claimTaken: true }, [])
    const result = await applyOrderStockMovements(TENANT, ORDER, ITEMS, 'sale')
    expect(result.outcome).toBe('duplicate')
    expect(result.lines).toEqual([])
  })

  test('a menu with no recipe has nothing to deduct', async () => {
    stub({ noRecipes: true }, [])
    expect((await applyOrderStockMovements(TENANT, ORDER, ITEMS, 'sale')).outcome).toBe('nothing_to_deduct')
  })

  test('a sale arriving after the cancellation stands down', async () => {
    stub({ claims: [{ reason: 'void', revision: 0 }] }, [])
    expect((await applyOrderStockMovements(TENANT, ORDER, ITEMS, 'sale')).outcome).toBe('cancelled_first')
  })
})

describe('best-effort wrappers write the audit row', () => {
  test('a register sale records source, cashier and lines', async () => {
    const audits: Record<string, unknown>[] = []
    stub({}, audits)

    await applyOrderStockBestEffort(TENANT, ORDER, ITEMS, 'sale', 0, null, {
      context: { source: 'pos', actorUserId: 'cashier-1' },
    })

    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      tenant_id: TENANT,
      event: 'order_sale',
      outcome: 'applied',
      source: 'pos',
      actor_user_id: 'cashier-1',
      order_id: ORDER,
      revision: 0,
      movement_count: 1,
    })
  })

  test('the refused second deduction is recorded too — the whole point', async () => {
    const audits: Record<string, unknown>[] = []
    stub({ claimTaken: true }, audits)

    await applyOrderStockBestEffort(TENANT, ORDER, ITEMS, 'sale', 0, null, {
      context: { source: 'customer_app' },
    })

    expect(audits[0]).toMatchObject({ outcome: 'duplicate', source: 'customer_app', movement_count: 0 })
  })

  test('a failure is recorded with its message', async () => {
    const audits: Record<string, unknown>[] = []
    stub({ failRecipes: true }, audits)

    await applyOrderStockBestEffort(TENANT, ORDER, ITEMS)

    expect(audits[0]).toMatchObject({ outcome: 'failed', source: 'system', detail: 'recipes unreadable' })
  })

  test('a cancellation restore is its own event', async () => {
    const audits: Record<string, unknown>[] = []
    stub(
      {
        movements: [
          { inventory_item_id: FLOUR, outlet_id: null, quantity_delta: -200, entered_quantity: 200, entered_unit_id: GRAM },
        ],
      },
      audits,
    )

    await reverseOrderStockBestEffort(TENANT, ORDER, { source: 'web_admin', actorUserId: 'owner-1' })

    expect(audits[0]).toMatchObject({
      event: 'order_restore',
      outcome: 'applied',
      source: 'web_admin',
      actor_user_id: 'owner-1',
    })
    expect((audits[0].lines as Array<{ quantityDelta: number }>)[0].quantityDelta).toBe(200)
  })

  test('an edit is labelled as an edit at its revision', async () => {
    const audits: Record<string, unknown>[] = []
    stub({}, audits)

    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 2, ITEMS, [], null, { source: 'pos', actorUserId: 'c1' })

    expect(audits[0]).toMatchObject({ event: 'order_edit', revision: 2, source: 'pos' })
  })
})
