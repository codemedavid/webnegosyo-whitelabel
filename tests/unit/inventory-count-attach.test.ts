/**
 * Filing a stocktake under the count it belonged to.
 *
 * The session table is worthless until the ledger points back at it: a count
 * with no movements attached reads as abandoned, which is a different lie from
 * the one the sessions were built to stop but a lie all the same.
 *
 * The database already refuses a non-stocktake carrying a session (see the
 * `stock_movement_count_session_is_valid` trigger). These tests pin the same
 * rule one layer up, where the merchant can be told why in words rather than
 * being handed a Postgres exception.
 */

import { recordStockMovementWith } from '@/lib/inventory/stock-service'
import { stockMovementInputSchema } from '@/lib/inventory/schemas'

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
const GRAM_ID = '11111111-1111-4111-8111-111111111111'
const FLOUR_ID = '33333333-3333-4333-8333-333333333333'
const COUNT_ID = '55555555-5555-4555-8555-555555555555'

const GRAM = {
  id: GRAM_ID,
  tenant_id: TENANT,
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
}

const FLOUR = {
  id: FLOUR_ID,
  tenant_id: TENANT,
  name: 'Flour',
  current_qty: 1000,
  reorder_level: 100,
  is_active: true,
  stock_unit_id: GRAM_ID,
  unit_cost: 0.05,
  is_prep: false,
}

function buildClient() {
  const captured: { movementInsert: Record<string, unknown> | null } = { movementInsert: null }

  const from = (tableName: string) => {
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
        if (tableName === 'inventory_stock') {
          return resolve({ data: { current_qty: FLOUR.current_qty }, error: null })
        }
        if (tableName === 'stock_movements') {
          return resolve({ data: { id: 'mv1', ...(payload as object) }, error: null })
        }
        return resolve({ data: FLOUR, error: null })
      },
    }
    return chain
  }

  return { client: { from } as never, captured }
}

const stocktake = (extra: Record<string, unknown> = {}) => ({
  inventory_item_id: FLOUR_ID,
  reason: 'stocktake' as const,
  quantity: 900,
  unit_id: GRAM_ID,
  ...extra,
})

describe('a stocktake filed under a count', () => {
  test('carries the session id onto the ledger row', async () => {
    // Without this the session has no members, and `judgeCountSession` reads
    // the whole count as abandoned however thoroughly it was performed.
    const { client, captured } = buildClient()

    await recordStockMovementWith(client, TENANT, stocktake({ inventory_count_id: COUNT_ID }))

    expect(captured.movementInsert?.inventory_count_id).toBe(COUNT_ID)
  })

  test('records no session when the count was a one-off', async () => {
    // Every caller that existed before sessions did — depletion, waste, a
    // merchant correcting one sack — must keep working untouched.
    const { client, captured } = buildClient()

    await recordStockMovementWith(client, TENANT, stocktake())

    expect(captured.movementInsert?.inventory_count_id ?? null).toBeNull()
  })
})

describe('what may belong to a count', () => {
  test('refuses a delivery that names a count session', () => {
    // A delivery attached to a count would raise coverage for an ingredient
    // nobody counted — the exact reassurance the session exists to withhold.
    expect(() =>
      stockMovementInputSchema.parse({
        inventory_item_id: FLOUR_ID,
        reason: 'receive',
        quantity: 5,
        unit_id: GRAM_ID,
        inventory_count_id: COUNT_ID,
      }),
    ).toThrow(/stock count/i)
  })

  test('refuses waste that names a count session', () => {
    expect(() =>
      stockMovementInputSchema.parse({
        inventory_item_id: FLOUR_ID,
        reason: 'waste',
        quantity: 5,
        unit_id: GRAM_ID,
        inventory_count_id: COUNT_ID,
      }),
    ).toThrow(/stock count/i)
  })

  test('accepts a stocktake that names one', () => {
    expect(() =>
      stockMovementInputSchema.parse({
        inventory_item_id: FLOUR_ID,
        reason: 'stocktake',
        quantity: 5,
        unit_id: GRAM_ID,
        inventory_count_id: COUNT_ID,
      }),
    ).not.toThrow()
  })

  test('leaves every movement that names no count alone', () => {
    // The regression that would matter most: a rule about sessions must not
    // start rejecting the ordinary deliveries this system already runs on.
    for (const reason of ['receive', 'waste', 'sale', 'void', 'stocktake'] as const) {
      expect(() =>
        stockMovementInputSchema.parse({
          inventory_item_id: FLOUR_ID,
          reason,
          quantity: 5,
          unit_id: GRAM_ID,
        }),
      ).not.toThrow()
    }
  })
})
