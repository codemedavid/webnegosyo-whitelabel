/**
 * The storefront's order-type read must hide types the merchant turned off
 * for online ordering (`available_on_web = false`) — POS-only channels such
 * as Grab must never appear in web checkout.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const eqCalls: Array<[string, unknown]> = []

function makeChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value])
      return chain
    },
    order: async () => ({ data: [{ id: 'ot-1' }], error: null }),
  }
  return chain
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => makeChain() }),
}))

describe('getEnabledOrderTypesByTenantClient', () => {
  beforeEach(() => {
    eqCalls.length = 0
  })

  test('filters by tenant, enabled, and web availability', async () => {
    const { getEnabledOrderTypesByTenantClient } = await import('@/lib/order-types-client')

    const rows = await getEnabledOrderTypesByTenantClient('tenant-1')

    expect(eqCalls).toEqual([
      ['tenant_id', 'tenant-1'],
      ['is_enabled', true],
      ['available_on_web', true],
    ])
    expect(rows).toEqual([{ id: 'ot-1' }])
  })
})

/**
 * The admin payment-method editor links methods to order types, so it must see
 * every enabled type — a register-only channel such as Grab is exactly the one
 * the merchant came to attach a method to.
 */
describe('getLinkableOrderTypesByTenantClient', () => {
  beforeEach(() => {
    eqCalls.length = 0
  })

  test('filters by tenant and enabled only — never by channel', async () => {
    const { getLinkableOrderTypesByTenantClient } = await import('@/lib/order-types-client')

    const rows = await getLinkableOrderTypesByTenantClient('tenant-1')

    expect(eqCalls).toEqual([
      ['tenant_id', 'tenant-1'],
      ['is_enabled', true],
    ])
    expect(rows).toEqual([{ id: 'ot-1' }])
  })
})
