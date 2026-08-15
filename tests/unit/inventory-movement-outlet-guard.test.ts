/**
 * The server contract for a movement that names a branch.
 *
 * `resolveMovementBranch` already refuses a manager naming somebody else's
 * shop. What it never checked is the other direction: a STORE-WIDE account may
 * name any branch, and `stock_movements.outlet_id` references `outlets(id)`
 * with no tenant scoping — so an explicit outlet id from another tenant would
 * have been written into this tenant's ledger. These tests pin three facts:
 * the store-wide admin's explicit choice is honored (not overridden back to
 * the pool), a foreign outlet is refused before anything is written, and a
 * tenant with no branches behaves exactly as before.
 */

import { recordStockMovementWith } from '@/lib/inventory/stock-service'

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() =>
    Promise.resolve({
      alertsRaised: 0,
      alertsResolved: 0,
      menuItemsDisabled: [],
      menuItemsReEnabled: [],
    }),
  ),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: () => ({}) }),
}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(() => Promise.resolve()),
}))

const TENANT = '44444444-4444-4444-8444-444444444444'
const NORTH = '66666666-6666-4666-8666-666666666666'

const GRAM = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: TENANT,
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
}

const BEEF = {
  id: '33333333-3333-4333-8333-333333333333',
  tenant_id: TENANT,
  name: 'Beef',
  current_qty: 100,
  reorder_level: 20,
  is_active: true,
  stock_unit_id: GRAM.id,
  unit_cost: 0.12,
  is_prep: false,
}

/**
 * A store-wide (owner) client. `outletExists` controls whether the named
 * branch reads back as one of this tenant's outlets.
 */
function buildClient(outletExists: boolean) {
  const captured: {
    movementInsert: Record<string, unknown> | null
    outletLookups: number
  } = { movementInsert: null, outletLookups: 0 }

  const from = (tableName: string) => {
    if (tableName === 'outlets') captured.outletLookups += 1
    let payload: unknown = null
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      limit: () => chain,
      single: () => chain,
      maybeSingle: () => chain,
      insert: (value: unknown) => {
        payload = value
        if (tableName === 'stock_movements') {
          captured.movementInsert = value as Record<string, unknown>
        }
        return chain
      },
      update: () => chain,
      then: (resolve: (v: unknown) => void) => {
        if (tableName === 'inventory_units') return resolve({ data: [GRAM], error: null })
        if (tableName === 'app_users') {
          return resolve({
            data: { role: 'admin', is_owner: true, outlet_id: null },
            error: null,
          })
        }
        if (tableName === 'outlets') {
          return resolve({ data: outletExists ? { id: NORTH } : null, error: null })
        }
        if (tableName === 'inventory_stock') {
          return resolve({ data: { current_qty: 40 }, error: null })
        }
        if (tableName === 'stock_movements') {
          return resolve({ data: { id: 'mv1', ...(payload as object) }, error: null })
        }
        return resolve({ data: BEEF, error: null })
      },
    }
    return chain
  }

  return {
    client: {
      from,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    } as never,
    captured,
  }
}

const movement = (outletId?: string | null) => ({
  inventory_item_id: BEEF.id,
  reason: 'receive' as const,
  quantity: 10,
  unit_id: GRAM.id,
  ...(outletId === undefined ? {} : { outlet_id: outletId }),
})

describe('recordStockMovementWith — a store-wide admin naming a branch', () => {
  it('honors the explicit branch instead of overriding it back to the store pool', async () => {
    const { client, captured } = buildClient(true)

    await recordStockMovementWith(client, TENANT, movement(NORTH))

    expect(captured.movementInsert?.outlet_id).toBe(NORTH)
  })

  it('refuses an outlet that does not belong to this tenant, before anything is written', async () => {
    const { client, captured } = buildClient(false)

    await expect(recordStockMovementWith(client, TENANT, movement(NORTH))).rejects.toThrow(
      /branch/i,
    )
    expect(captured.movementInsert).toBeNull()
  })

  it('leaves a no-branch tenant untouched: store pool, and no outlet lookup at all', async () => {
    const { client, captured } = buildClient(true)

    await recordStockMovementWith(client, TENANT, movement())

    expect(captured.movementInsert?.outlet_id).toBeNull()
    expect(captured.outletLookups).toBe(0)
  })
})
