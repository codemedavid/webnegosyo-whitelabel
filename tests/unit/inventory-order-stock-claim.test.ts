/**
 * Phase 0 — one order depletes stock exactly once, enforced by the database.
 *
 * Both ledger writers guarded themselves with a SELECT-then-INSERT: look for an
 * existing movement, and insert if there is none. Under concurrency that is not
 * a guard at all — N parallel calls all read "none" and all insert. The trigger
 * applies N deltas, `current_qty` has no non-negative CHECK, and auto-86 then
 * hides every dish touching those ingredients. On the PUBLIC
 * `customer-order-stock` route that is an unauthenticated menu takedown.
 *
 * The subsystem review proposed a UNIQUE constraint on the ledger itself,
 * `(tenant_id, order_id, reason)`. That is wrong: one order legitimately writes
 * one row per ingredient, all sharing those three values, and
 * `resolveOrderDepletions` keys its totals on `inventory_item_id::unit_id`, so
 * even a variant including the ingredient would reject an order whose base
 * recipe uses grams and whose addon uses kilograms for the same ingredient.
 *
 * So the uniqueness lives on a separate claim, one row per
 * (tenant, order, direction), and the ledger's row shape is left alone.
 */

import {
  claimOrderStockApplication,
  releaseOrderStockApplication,
} from '@/lib/inventory/order-stock-claim'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-1'

interface Recorded {
  table: string | null
  inserted: Record<string, unknown> | null
  filters: Array<[string, unknown]>
  deleted: boolean
}

/**
 * Supabase stub that records the filters it was given. Most inventory suites
 * discard them, which is how a missing `tenant_id` filter could go unnoticed —
 * this path uses the service-role client, so RLS is not a backstop behind it.
 */
function buildClient(outcome: { error?: { code?: string; message?: string } } = {}) {
  const recorded: Recorded = { table: null, inserted: null, filters: [], deleted: false }

  const from = (table: string) => {
    recorded.table = table
    const chain: Record<string, unknown> = {
      insert: (value: unknown) => {
        recorded.inserted = value as Record<string, unknown>
        return chain
      },
      delete: () => {
        recorded.deleted = true
        return chain
      },
      eq: (column: string, value: unknown) => {
        recorded.filters.push([column, value])
        return chain
      },
      select: () => chain,
      single: () => chain,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: outcome.error ?? null }),
    }
    return chain
  }

  return { client: { from } as never, recorded }
}

describe('claimOrderStockApplication', () => {
  test('a first claim succeeds so the caller may deplete', async () => {
    // Arrange
    const { client, recorded } = buildClient()

    // Act
    const claimed = await claimOrderStockApplication(client, TENANT, ORDER, 'sale')

    // Assert
    expect(claimed).toBe(true)
    expect(recorded.table).toBe('order_stock_applications')
    expect(recorded.inserted).toMatchObject({
      tenant_id: TENANT,
      order_id: ORDER,
      reason: 'sale',
    })
  })

  test('a duplicate claim is refused rather than throwing', async () => {
    // Arrange — 23505 is Postgres unique_violation: someone got here first.
    const { client } = buildClient({ error: { code: '23505', message: 'duplicate key' } })

    // Act
    const claimed = await claimOrderStockApplication(client, TENANT, ORDER, 'sale')

    // Assert — a losing race is a normal outcome, not a failure.
    expect(claimed).toBe(false)
  })

  test('any other database error throws instead of reading as already-applied', async () => {
    // Arrange — treating an outage as "already done" would silently skip
    // depletion for a real sale, which is the failure this guard exists to stop.
    const { client } = buildClient({ error: { code: '08006', message: 'connection failure' } })

    // Act / Assert
    await expect(
      claimOrderStockApplication(client, TENANT, ORDER, 'sale'),
    ).rejects.toMatchObject({ code: '08006' })
  })

  test('sale and void are claimed separately', async () => {
    // Arrange — an order that was sold and then voided must stay correct in
    // both directions, so the claim is keyed on direction too.
    const { client, recorded } = buildClient()

    // Act
    await claimOrderStockApplication(client, TENANT, ORDER, 'void')

    // Assert
    expect(recorded.inserted).toMatchObject({ reason: 'void' })
  })
})

describe('releaseOrderStockApplication', () => {
  test('releases the claim so a failed depletion can be retried', async () => {
    // Arrange — claiming before writing means a crash mid-write would otherwise
    // poison the order forever: the claim exists, the stock never moved.
    const { client, recorded } = buildClient()

    // Act
    await releaseOrderStockApplication(client, TENANT, ORDER, 'sale')

    // Assert
    expect(recorded.deleted).toBe(true)
  })

  test('scopes the release to one tenant, order and direction', async () => {
    // Arrange
    const { client, recorded } = buildClient()

    // Act
    await releaseOrderStockApplication(client, TENANT, ORDER, 'sale')

    // Assert — a release missing the tenant filter would delete another shop's
    // claim and let its order deplete twice.
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', TENANT],
        ['order_id', ORDER],
        ['reason', 'sale'],
      ]),
    )
  })

  test('never throws — a failed release must not sink the caller', async () => {
    // Arrange — the caller is already handling an error when it releases.
    const { client } = buildClient({ error: { code: '08006', message: 'connection failure' } })

    // Act / Assert
    await expect(
      releaseOrderStockApplication(client, TENANT, ORDER, 'sale'),
    ).resolves.toBeUndefined()
  })
})
