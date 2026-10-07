/**
 * The platform order write used to cost, after the INSERTs, a second
 * order-type read (for its name), a token UPDATE, and a five-query customer
 * profile recompute — all before the customer heard back. The token now rides
 * in the INSERT, the name comes from the IDOR read, and the profile work
 * follows the response (inline here: jest has no request scope).
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const serverReads: string[] = []
const adminOps: Array<{ table: string; op: string; payload?: unknown }> = []

function readChain(data: unknown) {
  const result = { data, error: null }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

const serverTables: Record<string, unknown> = {
  tenants: null,
  menu_items: [{ id: 'mi-1', name: 'Halo-halo' }],
  order_types: { id: 'ot-1', name: 'Pickup' },
  payment_methods: null,
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      serverReads.push(table)
      return readChain(serverTables[table] ?? null)
    },
  }),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        adminOps.push({ table, op: 'insert', payload })
        return readChain(table === 'orders'
          ? { id: 'order-1', ...(payload as Record<string, unknown>) }
          : null)
      },
      update: (payload: unknown) => {
        adminOps.push({ table, op: 'update', payload })
        return readChain(null)
      },
    }),
  }),
}))

const upsertCustomerFromOrder = jest.fn(async (...args: unknown[]) => { void args })

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: async () => {} }))
jest.mock('@/lib/customers-service', () => ({
  createSupabaseCustomerStore: () => ({}),
  upsertCustomerFromOrder: (...args: unknown[]) => upsertCustomerFromOrder(...args),
}))

const line = {
  menu_item_id: 'mi-1', menu_item_name: 'Halo-halo', addons: [] as string[], quantity: 1, price: 120, subtotal: 120,
}

async function placeOrder() {
  const { createOrder } = await import('@/lib/orders-service')
  const create = createOrder as unknown as (...args: unknown[]) => Promise<{ order: Record<string, unknown>; orderToken?: string }>
  return create('tenant-1', [line], { name: 'Ana', contact: '09171234567' }, 'ot-1')
}

describe('createOrder — platform write round trips', () => {
  beforeEach(() => {
    serverReads.length = 0
    adminOps.length = 0
    upsertCustomerFromOrder.mockClear()
  })

  test('reads the order type once and stores the name from that tenant-scoped row', async () => {
    // Act
    await placeOrder()

    // Assert
    expect(serverReads.filter((table) => table === 'order_types')).toHaveLength(1)
    const insertedOrder = adminOps.find((op) => op.table === 'orders' && op.op === 'insert')!.payload as Record<string, unknown>
    expect(insertedOrder.order_type).toBe('Pickup')
  })

  test('writes the token hash in the INSERT and never issues a token UPDATE', async () => {
    // Act
    const result = await placeOrder()

    // Assert
    const insertedOrder = adminOps.find((op) => op.table === 'orders' && op.op === 'insert')!.payload as Record<string, unknown>
    expect(typeof result.orderToken).toBe('string')
    expect(insertedOrder.order_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(insertedOrder.order_token_hash).not.toBe(result.orderToken)
    expect(typeof insertedOrder.order_token_expires_at).toBe('string')
    expect(adminOps.some((op) => op.op === 'update')).toBe(false)
  })

  test('the row handed back to the browser carries neither the token hash nor its expiry', async () => {
    // Act
    const result = await placeOrder()

    // Assert
    expect(result.order.id).toBe('order-1')
    expect(result.order).not.toHaveProperty('order_token_hash')
    expect(result.order).not.toHaveProperty('order_token_expires_at')
  })

  test('still rolls the order into the customer profile', async () => {
    // Act
    await placeOrder()

    // Assert
    expect(upsertCustomerFromOrder).toHaveBeenCalledWith(expect.anything(), 'tenant-1', expect.objectContaining({
      orderId: 'order-1', name: 'Ana', contact: '09171234567',
    }))
  })
})
