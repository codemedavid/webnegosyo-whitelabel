/**
 * How many times one stock movement asks who is recording it.
 *
 * A merchant recording a count from the phone watches a spinner while the
 * platform resolves their identity THREE separate times:
 *
 *   1. the route's own `auth.getUser()`, to authorize the call at all
 *   2. `resolveActingBranchScope` inside the service — `auth.getUser()` again,
 *      then a second `app_users` read the route had already done
 *   3. `resolveActingUserId`, for the movement's `created_by` — a third
 *
 * `supabase.auth.getUser()` is not a local token decode. It calls the auth
 * server to verify the JWT, so each one is a full network round trip, and they
 * run in sequence before the write even begins. On mobile data, against a
 * serverless function that is itself round-tripping to Supabase, that is most
 * of the wait the merchant sees.
 *
 * The identity is the same all three times. The route already knows it, and
 * already knows the `app_users` row that decides the branch. Passing what it
 * knows removes the duplicates without loosening anything: the actor is still
 * resolved SERVER-side from `app_users`, never taken from the phone, which is
 * the property that stops one shop moving another's stock.
 */

import { recordStockMovementWith } from '@/lib/inventory/stock-service'

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  syncStockAlertsForItem: jest.fn(() =>
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

const TENANT = '44444444-4444-4444-8444-444444444444'
const GRAM_ID = '11111111-1111-4111-8111-111111111111'
const FLOUR_ID = '33333333-3333-4333-8333-333333333333'
const NORTH = '66666666-6666-4666-8666-666666666666'
const USER_ID = '77777777-7777-4777-8777-777777777777'

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

interface Trace {
  getUserCalls: number
  tablesRead: string[]
  movementInsert: Record<string, unknown> | null
}

/**
 * A client that counts what a single movement costs in round trips.
 *
 * `auth.getUser` resolves a real user so the un-hinted path behaves as it does
 * in production — the point is how OFTEN it is asked, not what it answers.
 */
function buildClient(appUser: Record<string, unknown> | null) {
  const trace: Trace = { getUserCalls: 0, tablesRead: [], movementInsert: null }

  const from = (tableName: string) => {
    trace.tablesRead.push(tableName)
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
          trace.movementInsert = value as Record<string, unknown>
        }
        return chain
      },
      update: () => chain,
      then: (resolve: (v: unknown) => void) => {
        if (tableName === 'inventory_units') return resolve({ data: [GRAM], error: null })
        if (tableName === 'app_users') return resolve({ data: appUser, error: null })
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

  const client = {
    from,
    auth: {
      getUser: () => {
        trace.getUserCalls += 1
        return Promise.resolve({ data: { user: { id: USER_ID } }, error: null })
      },
    },
  }

  return { client: client as never, trace }
}

const stocktake = {
  inventory_item_id: FLOUR_ID,
  reason: 'stocktake' as const,
  quantity: 10,
  unit_id: GRAM_ID,
}

describe('recording a movement when the caller already knows who is acting', () => {
  test('asks the auth server nothing at all', () => {
    // The wait the merchant sees. Three sequential remote verifications of a
    // JWT the route has already verified once.
    const { client, trace } = buildClient({ role: 'admin', is_owner: true, outlet_id: null })

    return recordStockMovementWith(client, TENANT, stocktake, {
      userId: USER_ID,
      scope: { kind: 'all' },
    }).then(() => {
      expect(trace.getUserCalls).toBe(0)
    })
  })

  test('does not read app_users again for a branch the caller resolved', () => {
    const { client, trace } = buildClient({ role: 'admin', is_owner: true, outlet_id: null })

    return recordStockMovementWith(client, TENANT, stocktake, {
      userId: USER_ID,
      scope: { kind: 'all' },
    }).then(() => {
      expect(trace.tablesRead).not.toContain('app_users')
    })
  })

  test('still attributes the movement to that person', () => {
    // Attribution is the whole reason the identity is resolved. Losing it to an
    // optimisation would leave shrinkage with nobody to ask about it.
    const { client, trace } = buildClient(null)

    return recordStockMovementWith(client, TENANT, stocktake, {
      userId: USER_ID,
      scope: { kind: 'all' },
    }).then(() => {
      expect(trace.movementInsert?.created_by).toBe(USER_ID)
    })
  })

  test('books the movement to the branch the caller resolved', () => {
    const { client, trace } = buildClient(null)

    return recordStockMovementWith(client, TENANT, stocktake, {
      userId: USER_ID,
      scope: { kind: 'branch', outletId: NORTH },
    }).then(() => {
      expect(trace.movementInsert?.outlet_id).toBe(NORTH)
    })
  })

  test('still refuses a branch the acting scope does not cover', () => {
    // The security property must survive the optimisation. A supplied scope is
    // the SERVER's own answer, so it still bounds what the phone may name.
    const { client } = buildClient(null)

    return expect(
      recordStockMovementWith(
        client,
        TENANT,
        { ...stocktake, outlet_id: '88888888-8888-4888-8888-888888888888' },
        { userId: USER_ID, scope: { kind: 'branch', outletId: NORTH } },
      ),
    ).rejects.toThrow()
  })
})

describe('recording a movement when nobody said who is acting', () => {
  test('falls back to resolving the actor itself, exactly as today', () => {
    // The order pipeline's service client passes no actor — a `sale` is
    // deducted by the system, not by a person — and must keep working.
    const { client, trace } = buildClient({ role: 'admin', is_owner: true, outlet_id: null })

    return recordStockMovementWith(client, TENANT, stocktake).then(() => {
      expect(trace.getUserCalls).toBeGreaterThan(0)
      expect(trace.tablesRead).toContain('app_users')
    })
  })
})
