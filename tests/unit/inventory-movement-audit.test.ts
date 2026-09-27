/**
 * Hand-recorded movements: a retried save must not record twice, and every
 * movement leaves an audit row naming who recorded it and from where.
 *
 * Production had three receives recorded twice by the same person minutes
 * apart — the shape of a phone save that timed out AFTER the server wrote it,
 * followed by the merchant tapping Save again. For a delivery that inflates the
 * shelf; for waste it is a double deduction.
 */

import { recordStockMovementWith } from '@/lib/inventory/stock-service'

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() => Promise.resolve({})),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: () => ({}) }),
}))

const TENANT = '44444444-4444-4444-8444-444444444444'
const GRAM_ID = '11111111-1111-4111-8111-111111111111'
const FLOUR_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '77777777-7777-4777-8777-777777777777'
const REQUEST_ID = '88888888-8888-4888-8888-888888888888'

const GRAM = { id: GRAM_ID, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const FLOUR = {
  id: FLOUR_ID, tenant_id: TENANT, name: 'Flour', current_qty: 1000, reorder_level: 0,
  is_active: true, stock_unit_id: GRAM_ID, unit_cost: 0.05, is_prep: false,
}

interface Harness {
  movementInserts: Record<string, unknown>[]
  audits: Record<string, unknown>[]
}

function buildClient(options: { conflict?: boolean; recent?: unknown[] } = {}) {
  const harness: Harness = { movementInserts: [], audits: [] }

  const from = (table: string) => {
    let mode: 'read' | 'insert' = 'read'
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      in: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => chain,
      maybeSingle: () => chain,
      update: () => chain,
      insert: (value: Record<string, unknown>) => {
        mode = 'insert'
        if (table === 'stock_movements') harness.movementInserts.push(value)
        if (table === 'inventory_audit_log') harness.audits.push(value)
        return chain
      },
      then: (resolve: (v: unknown) => void) => {
        if (table === 'inventory_units') return resolve({ data: [GRAM], error: null })
        if (table === 'inventory_audit_log') return resolve({ error: null })
        if (table === 'stock_movements' && mode === 'insert') {
          return resolve(
            options.conflict
              ? { data: null, error: { code: '23505', message: 'duplicate key' } }
              : { data: { id: 'mv-new', created_at: '2026-09-26T10:00:00Z', ...harness.movementInserts.at(-1) }, error: null },
          )
        }
        if (table === 'stock_movements') {
          // A read: either the retried request's original row, or the recent list.
          return resolve(
            options.conflict
              ? { data: { id: 'mv-original', reason: 'waste', quantity_delta: -500, inventory_item_id: FLOUR_ID }, error: null }
              : { data: options.recent ?? [], error: null },
          )
        }
        return resolve({ data: FLOUR, error: null })
      },
    }
    return chain
  }

  return { client: { from, auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) } } as never, harness }
}

const ACTOR = { userId: USER_ID, scope: { kind: 'store' } as never, source: 'merchant_app' as const }

const waste = {
  inventory_item_id: FLOUR_ID,
  reason: 'waste' as const,
  quantity: 500,
  unit_id: GRAM_ID,
  client_request_id: REQUEST_ID,
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => jest.restoreAllMocks())

describe('retried manual movement', () => {
  test('the retry key travels onto the ledger row', async () => {
    const { client, harness } = buildClient()
    await recordStockMovementWith(client, TENANT, waste, ACTOR)
    expect(harness.movementInserts[0]).toMatchObject({ client_request_id: REQUEST_ID })
  })

  test('a retry the database refuses returns the original movement instead of failing', async () => {
    const { client, harness } = buildClient({ conflict: true })

    const result = await recordStockMovementWith(client, TENANT, waste, ACTOR)

    expect(result.alreadyRecorded).toBe(true)
    expect(result.movement).toMatchObject({ id: 'mv-original' })
    // Exactly one insert attempt, and nothing written to the audit log as a
    // second movement — the first request already logged it.
    expect(harness.movementInserts).toHaveLength(1)
    expect(harness.audits).toHaveLength(0)
  })

  test('a conflict without a retry key is a real error, not swallowed', async () => {
    const { client } = buildClient({ conflict: true })
    const withoutKey = { ...waste, client_request_id: undefined }
    await expect(recordStockMovementWith(client, TENANT, withoutKey, ACTOR)).rejects.toMatchObject({ code: '23505' })
  })
})

describe('manual movement audit row', () => {
  test('records who, where from, and what moved', async () => {
    const { client, harness } = buildClient()

    await recordStockMovementWith(client, TENANT, waste, ACTOR)

    expect(harness.audits).toHaveLength(1)
    expect(harness.audits[0]).toMatchObject({
      tenant_id: TENANT,
      event: 'manual_movement',
      outcome: 'applied',
      source: 'merchant_app',
      actor_user_id: USER_ID,
      is_suspected_duplicate: false,
      movement_count: 1,
    })
    expect((harness.audits[0].lines as Array<{ name: string }>)[0].name).toBe('Flour')
  })

  test('flags the same waste by the same person a minute earlier', async () => {
    const { client, harness } = buildClient({
      recent: [{
        id: 'mv-earlier', inventory_item_id: FLOUR_ID, reason: 'waste', entered_quantity: 500,
        entered_unit_id: GRAM_ID, outlet_id: null, created_by: USER_ID,
        created_at: new Date(Date.now() - 60_000).toISOString(),
      }],
    })

    await recordStockMovementWith(client, TENANT, waste, ACTOR)

    expect(harness.audits[0]).toMatchObject({ is_suspected_duplicate: true })
  })

  test('the web admin is the source when no route names one', async () => {
    const { client, harness } = buildClient()
    await recordStockMovementWith(client, TENANT, waste)
    expect(harness.audits[0]).toMatchObject({ source: 'web_admin', actor_user_id: USER_ID })
  })
})
