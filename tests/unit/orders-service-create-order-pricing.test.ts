/**
 * `createOrder` (platform backend) runs AFTER `createOrderAction` has priced
 * every line at the price the customer was shown — sale price, branch price,
 * options and add-ons included. It then ran a second, older floor against
 * `menu_items.price`, the LIST price, and raised every sale-priced or
 * branch-cheaper line straight back up: the customer was shown ₱120 and the
 * platform row billed ₱150. The same loop also let a NaN price through
 * (`NaN < x` is false) and mutated the caller's items in place.
 *
 * It must now keep the caller's verified price, still refuse garbage, and
 * derive the subtotal itself.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const inserts: Array<{ table: string; payload: unknown }> = []

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
  createClient: async () => ({ from: (table: string) => readChain(serverTables[table] ?? null) }),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        inserts.push({ table, payload })
        return readChain(table === 'orders' ? { id: 'order-1' } : null)
      },
    }),
  }),
}))

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: async () => {} }))
jest.mock('@/lib/order-token', () => ({ createOrderToken: async () => 'tok' }))
jest.mock('@/lib/customers-service', () => ({
  createSupabaseCustomerStore: () => ({}),
  upsertCustomerFromOrder: async () => {},
}))

function line(overrides: Record<string, unknown> = {}) {
  return {
    menu_item_id: 'mi-1',
    menu_item_name: 'Halo-halo',
    addons: [] as string[],
    quantity: 2,
    price: 120,
    subtotal: 240,
    special_instructions: undefined as string | undefined,
    ...overrides,
  }
}

async function loadCreateOrder() {
  const { createOrder } = await import('@/lib/orders-service')
  return createOrder as unknown as (...args: unknown[]) => Promise<{ order: { id: string } }>
}

const insertedItems = () =>
  (inserts.find((row) => row.table === 'order_items')?.payload ?? []) as Array<Record<string, unknown>>
const insertedOrder = () =>
  (inserts.find((row) => row.table === 'orders')?.payload ?? {}) as Record<string, unknown>

describe('createOrder — keeps the price the action verified', () => {
  beforeEach(() => {
    inserts.length = 0
  })

  test('does not raise a sale-priced line back to the list price', async () => {
    // menu_items.price would be ₱150; the action verified the ₱120 sale price.
    serverTables.menu_items = [{ id: 'mi-1', name: 'Halo-halo', price: 150 }]
    const createOrder = await loadCreateOrder()

    await createOrder('tenant-1', [line()])

    expect(insertedItems()[0]).toMatchObject({ price: 120, subtotal: 240 })
    expect(insertedOrder().total).toBe(240)
  })

  test('derives the subtotal from price × quantity', async () => {
    const createOrder = await loadCreateOrder()

    await createOrder('tenant-1', [line({ subtotal: 1 })])

    expect(insertedItems()[0]).toMatchObject({ subtotal: 240 })
  })

  test.each([
    ['NaN', Number.NaN],
    ['a string', '5'],
    ['negative', -1],
  ])('refuses a %s price', async (_label, price) => {
    const createOrder = await loadCreateOrder()

    await expect(createOrder('tenant-1', [line({ price })])).rejects.toThrow()
    expect(inserts).toEqual([])
  })

  test('still refuses a dish the tenant does not have', async () => {
    const createOrder = await loadCreateOrder()

    await expect(createOrder('tenant-1', [line({ menu_item_id: 'other-tenant-dish' })])).rejects.toThrow(/not found/i)
  })

  test('never mutates the caller’s items or customer data', async () => {
    const createOrder = await loadCreateOrder()
    const items = [line({ subtotal: 1, special_instructions: 'x'.repeat(1500) })]
    const customerData = { notes: 'y'.repeat(900) }

    await createOrder('tenant-1', items, undefined, undefined, customerData)

    expect(items[0].subtotal).toBe(1)
    expect(items[0].special_instructions).toHaveLength(1500)
    expect(customerData.notes).toHaveLength(900)
  })
})
