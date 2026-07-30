/**
 * Phase 0 — a delivery price must be stored in the unit the shelf is measured
 * in, not the unit the merchant bought in.
 *
 * `inventory_items.unit_cost` is per STOCK unit: every downstream figure —
 * recipe cost, dish margin, and now the daily inventory report's COGS and
 * shrinkage valuation — multiplies it by a quantity that is also in stock
 * units. The movement's `quantity` is converted before it is written
 * (`resolveMovementDelta`), but its `unit_cost` was not, so a merchant who
 * stocks in grams and buys in kilograms stored a price 1000x too high.
 *
 * That figure never looks wrong on the receiving screen — it is exactly what
 * they typed. It only surfaces three screens away as an impossible food cost,
 * which is why this is pinned at the seam that writes it rather than left to
 * the pure conversion test alone.
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

const GRAM = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '44444444-4444-4444-8444-444444444444',
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
}

const KILOGRAM = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: '44444444-4444-4444-8444-444444444444',
  name: 'Kilogram',
  abbreviation: 'kg',
  dimension: 'weight',
  to_base_factor: 1000,
}

/** Stocked in GRAMS, with an empty shelf so the moving average takes the new price outright. */
const BEEF = {
  id: '33333333-3333-4333-8333-333333333333',
  tenant_id: '44444444-4444-4444-8444-444444444444',
  name: 'Beef',
  current_qty: 0,
  reorder_level: 500,
  is_active: true,
  stock_unit_id: '11111111-1111-4111-8111-111111111111',
  unit_cost: 0,
  is_prep: false,
}

interface Captured {
  movementInsert: Record<string, unknown> | null
  itemUpdate: Record<string, unknown> | null
}

/**
 * Supabase stub that answers per table and captures what was written. The
 * shared `table()` helper other inventory suites use discards its payloads,
 * which is precisely the value under test here.
 */
function buildClient(item: Record<string, unknown>, units: readonly unknown[]) {
  const captured: Captured = { movementInsert: null, itemUpdate: null }

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
      update: (value: unknown) => {
        payload = value
        if (tableName === 'inventory_items') {
          captured.itemUpdate = value as Record<string, unknown>
        }
        return chain
      },
      then: (resolve: (v: unknown) => void) => {
        if (tableName === 'inventory_units') return resolve({ data: units, error: null })
        if (tableName === 'stock_movements') {
          return resolve({ data: { id: 'mv1', ...(payload as object) }, error: null })
        }
        return resolve({ data: item, error: null })
      },
    }
    return chain
  }

  return { client: { from } as never, captured }
}

describe('recordStockMovementWith — delivery price is stored per stock unit', () => {
  test('2 kg at P120/kg on a gram-stocked ingredient stores P0.12 per gram', async () => {
    // Arrange
    const { client, captured } = buildClient(BEEF, [GRAM, KILOGRAM])

    // Act
    await recordStockMovementWith(client, '44444444-4444-4444-8444-444444444444', {
      inventory_item_id: '33333333-3333-4333-8333-333333333333',
      reason: 'receive',
      quantity: 2,
      unit_id: '22222222-2222-4222-8222-222222222222',
      unit_cost: 120,
    })

    // Assert — the quantity was already converted; the price must be too.
    expect(captured.movementInsert?.quantity_delta).toBeCloseTo(2000, 8)
    expect(captured.movementInsert?.unit_cost).toBeCloseTo(0.12, 8)
  })

  test('the blended item cost is per stock unit, so 2 kg reads as P240 of stock', async () => {
    // Arrange
    const { client, captured } = buildClient(BEEF, [GRAM, KILOGRAM])

    // Act
    await recordStockMovementWith(client, '44444444-4444-4444-8444-444444444444', {
      inventory_item_id: '33333333-3333-4333-8333-333333333333',
      reason: 'receive',
      quantity: 2,
      unit_id: '22222222-2222-4222-8222-222222222222',
      unit_cost: 120,
    })

    // Assert
    const blended = captured.itemUpdate?.unit_cost as number
    expect(blended).toBeCloseTo(0.12, 8)
    const deltaInStockUnit = captured.movementInsert?.quantity_delta as number
    expect(deltaInStockUnit * blended).toBeCloseTo(240, 6)
  })

  test('a price entered in the stock unit is stored unchanged', async () => {
    // Arrange — no conversion to do; this must not become a second bug.
    const { client, captured } = buildClient(BEEF, [GRAM, KILOGRAM])

    // Act
    await recordStockMovementWith(client, '44444444-4444-4444-8444-444444444444', {
      inventory_item_id: '33333333-3333-4333-8333-333333333333',
      reason: 'receive',
      quantity: 500,
      unit_id: '11111111-1111-4111-8111-111111111111',
      unit_cost: 0.12,
    })

    // Assert
    expect(captured.movementInsert?.unit_cost).toBeCloseTo(0.12, 8)
  })

  test('a delivery with no price recorded leaves the cost alone', async () => {
    // Arrange — a blank price means "unknown", never "free".
    const { client, captured } = buildClient(BEEF, [GRAM, KILOGRAM])

    // Act
    await recordStockMovementWith(client, '44444444-4444-4444-8444-444444444444', {
      inventory_item_id: '33333333-3333-4333-8333-333333333333',
      reason: 'receive',
      quantity: 2,
      unit_id: '22222222-2222-4222-8222-222222222222',
    })

    // Assert
    expect(captured.movementInsert?.unit_cost).toBeNull()
    expect(captured.itemUpdate).toBeNull()
  })

  test('a stocktake carries no price, so nothing is converted', async () => {
    // Arrange
    const { client, captured } = buildClient({ ...BEEF, current_qty: 1500 }, [GRAM, KILOGRAM])

    // Act — the merchant counted 1 kg on a shelf the system thought held 1.5 kg.
    await recordStockMovementWith(client, '44444444-4444-4444-8444-444444444444', {
      inventory_item_id: '33333333-3333-4333-8333-333333333333',
      reason: 'stocktake',
      quantity: 1,
      unit_id: '22222222-2222-4222-8222-222222222222',
    })

    // Assert — the discrepancy is the delta, in stock units.
    expect(captured.movementInsert?.quantity_delta).toBeCloseTo(-500, 8)
    expect(captured.movementInsert?.unit_cost).toBeNull()
  })
})
