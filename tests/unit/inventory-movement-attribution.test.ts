/**
 * Phase 3b — every hand-entered movement names who entered it.
 *
 * `stock_movements.created_by` has existed since the ledger's first migration
 * and has never had a single writer, so the one question the daily report
 * provokes has been unanswerable: the report says ₱500 of beef went missing on
 * Tuesday, and nothing records who counted the shelf that day. Shrinkage is
 * only actionable against a person and a time — without attribution the report
 * can name a loss but never begin an investigation.
 *
 * Attribution is deliberately SECONDARY to the movement itself. If the identity
 * lookup fails, the stock still has to be recorded: refusing to write a count
 * because we could not name the counter would trade a small gap in the audit
 * trail for a wrong quantity on the shelf, which is the worse of the two.
 *
 * Machine-written movements stay anonymous on purpose. A `sale` is deducted by
 * the order pipeline, not by a person, and stamping the customer or a service
 * account onto it would put a name against a row nobody typed.
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
const COUNTER = '55555555-5555-4555-8555-555555555555'

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
  current_qty: 1000,
  reorder_level: 500,
  is_active: true,
  stock_unit_id: GRAM.id,
  unit_cost: 0.12,
  is_prep: false,
}

type AuthResponse = () => Promise<{ data: { user: { id: string } | null }; error: unknown }>

/**
 * Supabase stub that captures the movement insert and answers `auth.getUser()`
 * however the test needs — including by throwing, which a real client does when
 * the network drops mid-request.
 */
function buildClient(getUser: AuthResponse) {
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
        if (tableName === 'stock_movements') {
          return resolve({ data: { id: 'mv1', ...(payload as object) }, error: null })
        }
        return resolve({ data: BEEF, error: null })
      },
    }
    return chain
  }

  return { client: { from, auth: { getUser } } as never, captured }
}

const STOCKTAKE = {
  inventory_item_id: BEEF.id,
  reason: 'stocktake' as const,
  quantity: 900,
  unit_id: GRAM.id,
}

describe('recordStockMovementWith — who entered this movement', () => {
  test('stamps the acting user onto the movement', async () => {
    // Arrange
    const { client, captured } = buildClient(async () => ({
      data: { user: { id: COUNTER } },
      error: null,
    }))

    // Act
    await recordStockMovementWith(client, TENANT, STOCKTAKE)

    // Assert — the ledger row now answers "who counted this".
    expect(captured.movementInsert?.created_by).toBe(COUNTER)
  })

  test('leaves the movement anonymous when there is no signed-in user', async () => {
    // The service-role client used by the order pipeline has no session. A
    // sale is deducted by the system, not by a person, and inventing an actor
    // for it would put a name against a row nobody typed.
    const { client, captured } = buildClient(async () => ({ data: { user: null }, error: null }))

    await recordStockMovementWith(client, TENANT, STOCKTAKE)

    expect(captured.movementInsert?.created_by).toBeNull()
  })

  test('still records the stock when the identity lookup errors', async () => {
    // Attribution is secondary to the count. Refusing to write a stocktake
    // because we could not name the counter would leave the shelf figure
    // wrong, which is worse than an unattributed row.
    const { client, captured } = buildClient(async () => ({
      data: { user: null },
      error: { message: 'session expired' },
    }))

    await recordStockMovementWith(client, TENANT, STOCKTAKE)

    expect(captured.movementInsert?.created_by).toBeNull()
    expect(captured.movementInsert?.quantity_delta).toBeCloseTo(-100, 8)
  })

  test('still records the stock when the identity lookup throws', async () => {
    // A dropped connection mid-request rejects rather than returning an error.
    const { client, captured } = buildClient(async () => {
      throw new Error('network down')
    })

    await recordStockMovementWith(client, TENANT, STOCKTAKE)

    expect(captured.movementInsert?.created_by).toBeNull()
    expect(captured.movementInsert?.quantity_delta).toBeCloseTo(-100, 8)
  })

  test('attributes a delivery as readily as a count', async () => {
    // Receiving is the other movement a merchant types by hand, and "who
    // accepted this delivery" is the same question in a different coat.
    const { client, captured } = buildClient(async () => ({
      data: { user: { id: COUNTER } },
      error: null,
    }))

    await recordStockMovementWith(client, TENANT, {
      inventory_item_id: BEEF.id,
      reason: 'receive',
      quantity: 500,
      unit_id: GRAM.id,
      unit_cost: 0.12,
    })

    expect(captured.movementInsert?.created_by).toBe(COUNTER)
  })
})
