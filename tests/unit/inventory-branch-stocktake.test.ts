/**
 * A stocktake is a statement about ONE shelf.
 *
 * `inventory_items.current_qty` is the roll-up — the sum of every branch — and
 * the stocktake arithmetic was reconciling against it. North holds 10, South
 * holds 90, the North manager counts 10, and the delta came out as
 * `10 - 100 = -90`: North driven to -80 and the store total collapsed to 10,
 * all from a count that was exactly right.
 *
 * The database trigger resolves the authoritative delta under the row lock (see
 * migration 20260810120000, which also measures against the branch row). What
 * is checked here is the figure this service resolves and hands to the alerting
 * and auto-86 pass, which the trigger never revisits.
 */

import { recordStockMovementWith } from '@/lib/inventory/stock-service'

const processStockLevelChanges = jest.fn(() =>
  Promise.resolve({
    alertsRaised: 0,
    alertsResolved: 0,
    menuItemsDisabled: [],
    menuItemsReEnabled: [],
  }),
)

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: (...args: unknown[]) => processStockLevelChanges(...(args as [])),
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

/** The chain holds 100g across its branches. */
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
 * A client whose account is locked to North and whose North shelf holds
 * `branchQty`, while the item roll-up says 100.
 */
function buildClient(branchQty: number | null) {
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
        if (tableName === 'app_users') {
          return resolve({
            data: { role: 'admin', is_owner: false, outlet_id: NORTH },
            error: null,
          })
        }
        if (tableName === 'inventory_stock') {
          return resolve({
            data: branchQty === null ? null : { current_qty: branchQty },
            error: null,
          })
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

const countOf = (quantity: number) => ({
  inventory_item_id: BEEF.id,
  reason: 'stocktake' as const,
  quantity,
  unit_id: GRAM.id,
})

describe('a branch stocktake is reconciled against that branch-s shelf', () => {
  beforeEach(() => {
    processStockLevelChanges.mockClear()
  })

  test('counting exactly what the branch holds is no change at all', async () => {
    // Arrange — North holds 10 of the chain-s 100.
    const { client, captured } = buildClient(10)

    // Act — the North manager counts 10.
    await recordStockMovementWith(client, TENANT, countOf(10))

    // Assert — a correct count moves nothing. Against the roll-up this was
    // -90, which drove North to -80 and the store total to 10.
    expect(captured.movementInsert?.quantity_delta).toBe(0)
  })

  test('a genuine shortfall at the branch is recorded as one', async () => {
    const { client, captured } = buildClient(10)

    await recordStockMovementWith(client, TENANT, countOf(4))

    expect(captured.movementInsert?.quantity_delta).toBe(-6)
  })

  test('the count itself is still sent as the absolute the trigger resolves', async () => {
    // `target_qty` is what makes the write race-proof: the database subtracts
    // under the row lock rather than trusting arithmetic done out here.
    const { client, captured } = buildClient(10)

    await recordStockMovementWith(client, TENANT, countOf(4))

    expect(captured.movementInsert?.target_qty).toBe(4)
    expect(captured.movementInsert?.outlet_id).toBe(NORTH)
  })

  test('a branch with no row yet counts against zero, not against the chain', async () => {
    // No row means the branch has never held this ingredient — see
    // `stock-location.ts`. Counting 10 there is a gain of 10, and the trigger-s
    // COALESCE says the same thing on the database side.
    const { client, captured } = buildClient(null)

    await recordStockMovementWith(client, TENANT, countOf(10))

    expect(captured.movementInsert?.quantity_delta).toBe(10)
  })

  test('the alerting pass is handed the branch delta, not the roll-up one', async () => {
    // Nothing downstream re-derives this: the trigger fixes the ledger row but
    // never revisits the figure alerting and auto-86 were given.
    const { client } = buildClient(10)

    await recordStockMovementWith(client, TENANT, countOf(10))

    const deltas = processStockLevelChanges.mock.calls[0][2] as Map<string, number>
    expect(deltas.get(BEEF.id)).toBe(0)
  })
})
