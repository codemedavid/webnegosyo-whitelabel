/**
 * Phase 5B follow-up — reading open alerts back out.
 *
 * The alert rows have been written since the engine shipped; nothing read them.
 * This is the read side: open alerts for one tenant, resolved to ingredient
 * names and units so a merchant sees "Flour is down to 5 kg", not a pair of
 * UUIDs.
 */

import { getOpenStockAlerts } from '@/lib/inventory/stock-alerts-read'

const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

/** Chainable, thenable Supabase stub; records the filters it was given. */
function table(data: unknown) {
  const calls: Record<string, unknown[][]> = {}
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
    calls,
  }
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls[method] = [...(calls[method] ?? []), args]
      return chain
    }
  }
  return chain as { calls: Record<string, unknown[][]> }
}

const ALERT_ROW = {
  id: 'alert-1',
  inventory_item_id: 'flour',
  level: 'low',
  quantity: 5,
  reorder_level: 20,
  created_at: '2026-07-27T10:00:00.000Z',
}

const FLOUR_ROW = { id: 'flour', name: 'Flour', stock_unit_id: 'unit-kg' }
const KG_ROW = { id: 'unit-kg', abbreviation: 'kg' }

function wire(
  alerts: unknown[] = [ALERT_ROW],
  items: unknown[] = [FLOUR_ROW],
  units: unknown[] = [KG_ROW],
  outlets: unknown[] = [],
) {
  const tables = {
    stock_alerts: table(alerts),
    inventory_items: table(items),
    inventory_units: table(units),
    outlets: table(outlets),
  }
  from.mockImplementation((name: keyof typeof tables) => tables[name])
  return tables
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('getOpenStockAlerts', () => {
  it('resolves an alert to its ingredient name and unit', async () => {
    wire()

    const alerts = await getOpenStockAlerts('t1')

    expect(alerts).toEqual([
      {
        id: 'alert-1',
        inventoryItemId: 'flour',
        name: 'Flour',
        level: 'low',
        quantity: 5,
        reorderLevel: 20,
        unitAbbreviation: 'kg',
        // Store-wide: the fixture row carries no branch. Alerts gained an
        // outlet in migration 20260813120000.
        outletId: null,
        createdAt: '2026-07-27T10:00:00.000Z',
      },
    ])
  })

  it('asks only for unresolved alerts belonging to the tenant', async () => {
    const tables = wire()

    await getOpenStockAlerts('t1')

    expect(tables.stock_alerts.calls.eq?.[0]).toEqual(['tenant_id', 't1'])
    expect(tables.stock_alerts.calls.is?.[0]).toEqual(['resolved_at', null])
  })

  it('returns nothing when the tenant has no open alerts', async () => {
    wire([])

    expect(await getOpenStockAlerts('t1')).toEqual([])
  })

  it('does not read ingredients when there are no alerts to resolve', async () => {
    wire([])

    await getOpenStockAlerts('t1')

    expect(from).not.toHaveBeenCalledWith('inventory_items')
  })

  it('orders exhausted ingredients ahead of low ones', async () => {
    wire(
      [
        { ...ALERT_ROW, id: 'low-1', level: 'low', inventory_item_id: 'flour' },
        { ...ALERT_ROW, id: 'out-1', level: 'out', inventory_item_id: 'sugar', quantity: 0 },
      ],
      [FLOUR_ROW, { id: 'sugar', name: 'Sugar', stock_unit_id: 'unit-kg' }],
    )

    const alerts = await getOpenStockAlerts('t1')

    expect(alerts.map((a) => a.id)).toEqual(['out-1', 'low-1'])
  })

  it('skips an alert whose ingredient has been deleted', async () => {
    // The FK cascades, so this should not happen — but a dangling alert must
    // not render as a nameless row.
    wire([ALERT_ROW], [])

    expect(await getOpenStockAlerts('t1')).toEqual([])
  })

  it('still names an ingredient whose unit cannot be resolved', async () => {
    // Losing the unit costs a suffix; it must not cost the whole alert.
    wire([ALERT_ROW], [FLOUR_ROW], [])

    const alerts = await getOpenStockAlerts('t1')

    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ name: 'Flour', unitAbbreviation: '' })
  })

  it('returns nothing rather than throwing when the read fails', async () => {
    // This renders inside the inventory page. A failed alert read must not take
    // the page down with it.
    from.mockImplementation(() => {
      throw new Error('stock_alerts is on fire')
    })

    expect(await getOpenStockAlerts('t1')).toEqual([])
  })
})

describe('getOpenStockAlerts — the branch an alert is about', () => {
  it('carries the branch through so the banner can name it', async () => {
    // Phase C stamps alerts with a branch. A read that drops the column leaves
    // the merchant reading "Flour is out of stock" across a two-shop chain.
    wire(
      [{ ...ALERT_ROW, outlet_id: 'o-south' }],
      [FLOUR_ROW],
      [KG_ROW],
      [{ id: 'o-south', name: 'South' }],
    )

    const [alert] = await getOpenStockAlerts('t1')

    expect(alert.outletId).toBe('o-south')
    expect(alert.branchName).toBe('South')
  })

  it('leaves a store-wide alert unstamped', async () => {
    wire([{ ...ALERT_ROW, outlet_id: null }])

    const [alert] = await getOpenStockAlerts('t1')

    expect(alert.outletId).toBeNull()
    expect(alert.branchName).toBeUndefined()
  })

  it('keeps the alert when the branch name cannot be resolved', async () => {
    // A deleted outlet. Losing the name costs a suffix, not the whole alert --
    // the same trade the unit lookup already makes.
    wire([{ ...ALERT_ROW, outlet_id: 'o-gone' }])

    const alerts = await getOpenStockAlerts('t1')

    expect(alerts).toHaveLength(1)
    expect(alerts[0].branchName).toBeUndefined()
  })
})
