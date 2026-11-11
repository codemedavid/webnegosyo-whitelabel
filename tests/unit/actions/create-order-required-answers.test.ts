/**
 * Required checkout questions — the authoritative server-side gate.
 *
 * The checkout form refuses to submit while a required question is blank, but
 * `createOrderAction` is a public server action: a forged request (or a tab
 * opened before the owner made a question required) reached it with the
 * answer missing and the order was written anyway. The action now reads the
 * store's OWN questions for the order's type and refuses, before anything is
 * claimed or inserted. Same scaffold as create-order-web-availability.test.ts,
 * with filters honoured so another order type's questions stay out of it.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

type Row = Record<string, unknown>

const insertedTables: string[] = []
const rpcCalls: string[] = []
const readTables: string[] = []
let tableRows: Record<string, Row | Row[] | null> = {}
let failFormRead = false

function makeQuery(table: string) {
  const filters: Array<[string, unknown]> = []
  const resolve = () => {
    if (table === 'customer_form_fields' && failFormRead) return { data: null, error: { message: 'timeout' } }
    const stored = tableRows[table] ?? null
    if (!Array.isArray(stored)) return { data: stored, error: null }
    return { data: stored.filter((row) => filters.every(([column, value]) => row[column] === value)), error: null }
  }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return chain
    },
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => resolve(),
    maybeSingle: async () => resolve(),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  }
  return chain
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      readTables.push(table)
      return {
        ...makeQuery(table),
        insert: () => {
          insertedTables.push(table)
          return makeQuery(table)
        },
      }
    },
    rpc: (name: string) => {
      rpcCalls.push(name)
      return makeQuery(`rpc:${name}`)
    },
  }),
}))

const TENANT_ID = 'tenant-1'
const PICKUP = 'ot-pickup'
const DELIVERY = 'ot-delivery'

function platformTenant() {
  return {
    order_backend: 'platform',
    is_active: true,
    name: 'Island Silog',
    slug: 'island-silog',
    inventory_enabled: false,
    convex_deployment_url: null,
    multi_branch_enabled: false,
    lalamove_enabled: false,
    distance_delivery_enabled: false,
    email_notifications_enabled: false,
  }
}

const question = (orderTypeId: string, field_name: string, extra: Row = {}): Row => ({
  tenant_id: TENANT_ID,
  order_type_id: orderTypeId,
  field_name,
  field_label: `${field_name} label`,
  field_type: 'text',
  is_required: true,
  ...extra,
})

const items = [
  { menu_item_id: 'mi-1', menu_item_name: 'Tapsilog', addons: [], quantity: 2, price: 160, subtotal: 320 },
]

interface Reply {
  success: boolean
  refused?: boolean
  error?: string
  fieldErrors?: Array<{ fieldName: string; message: string }>
}

async function placeOrder(orderTypeId: string | undefined, customerData?: Record<string, unknown>): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await createOrderAction(TENANT_ID, items, undefined, orderTypeId, customerData)) as Reply
}

describe('createOrderAction — required checkout questions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    rpcCalls.length = 0
    readTables.length = 0
    failFormRead = false
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: PICKUP, type: 'pickup', name: 'Pickup', available_on_web: true },
      customer_form_fields: [
        question(PICKUP, 'customer_name'),
        question(PICKUP, 'customer_phone', { field_type: 'phone' }),
        question(PICKUP, 'agree', { field_type: 'checkbox', field_label: 'No refunds' }),
        question(PICKUP, 'note', { is_required: false }),
        question(DELIVERY, 'delivery_address', { field_type: 'textarea' }),
      ],
    }
  })

  test('refuses an order missing required answers, naming each one, before any claim or insert', async () => {
    const result = await placeOrder(PICKUP, { customer_name: 'Juan', customer_phone: '   ' })

    expect(result.success).toBe(false)
    expect(result.refused).toBe(true)
    expect(result.fieldErrors).toEqual([
      { fieldName: 'customer_phone', message: 'customer_phone label is required' },
      { fieldName: 'agree', message: 'Please tick “No refunds”' },
    ])
    expect(result.error).toContain('customer_phone label is required')
    expect(result.error).toContain('Please tick “No refunds”')
    expect(insertedTables).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  test('refuses an order that sent no answers at all', async () => {
    const result = await placeOrder(PICKUP, undefined)
    expect(result.refused).toBe(true)
    expect(result.fieldErrors?.map((error) => error.fieldName)).toEqual(['customer_name', 'customer_phone', 'agree'])
    expect(insertedTables).toEqual([])
  })

  test('lets a fully answered order through the gate', async () => {
    const result = await placeOrder(PICKUP, { customer_name: 'Juan', customer_phone: '+639171234567', agree: 'yes' })
    expect(result.fieldErrors).toBeUndefined()
    expect(result.error ?? '').not.toMatch(/is required|Please tick/)
  })

  test('ignores a required question that belongs to another order type', async () => {
    const result = await placeOrder(PICKUP, { customer_name: 'Juan', customer_phone: '+639171234567', agree: 'yes' })
    expect(result.error ?? '').not.toMatch(/delivery_address/)
  })

  test('ignores optional questions', async () => {
    const result = await placeOrder(PICKUP, { customer_name: 'Juan', customer_phone: '+639171234567', agree: 'yes', note: '' })
    expect(result.fieldErrors).toBeUndefined()
  })

  test('ignores another store’s questions for the same order type id', async () => {
    tableRows.customer_form_fields = [question(PICKUP, 'customer_name', { tenant_id: 'other-tenant' })]
    const result = await placeOrder(PICKUP, {})
    expect(result.fieldErrors).toBeUndefined()
  })

  test('asks nothing when the order names no order type', async () => {
    const result = await placeOrder(undefined, {})
    expect(result.fieldErrors).toBeUndefined()
    expect(readTables).not.toContain('customer_form_fields')
  })

  test('lets the order through when the questions cannot be read (the form already checked them)', async () => {
    failFormRead = true
    const result = await placeOrder(PICKUP, {})
    expect(result.fieldErrors).toBeUndefined()
    expect(result.error ?? '').not.toMatch(/is required|Please tick/)
  })
})
