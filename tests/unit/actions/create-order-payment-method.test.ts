/**
 * createOrderAction records the STORE's payment method, on every backend.
 *
 * The browser's name / account details / QR URL are ignored; the method is
 * read by id (tenant-scoped, active, linked to the order type) and the stored
 * row is what the platform DB, a tenant's own Supabase and Convex receive. A
 * proof-required method refuses an order with no screenshot and no reference,
 * as a refusal (`refused: true`), before any order row is written.
 *
 * Same scaffold as create-order-refusal-discriminator.test.ts; the backend
 * writers are stubbed so the test can read what each would have stored.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const PM_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_TYPE_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = 'tenant-1'

let tableRows: Record<string, unknown> = {}

function makeQuery(table: string) {
  const row = tableRows[table] ?? null
  const result = { data: row, error: null }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => ({ ...makeQuery(table), insert: () => makeQuery(table) }) }),
}))

const SAVED = { order: { id: 'order-1', total: 320 }, orderToken: 'tok' }
const createOrder = jest.fn(async (...args: unknown[]) => { void args; return SAVED })
const createOrderConvex = jest.fn(async (...args: unknown[]) => { void args; return SAVED })
const createOrderTenantSupabase = jest.fn(async (...args: unknown[]) => { void args; return SAVED })

jest.mock('@/lib/orders-service', () => ({
  createOrder: (...args: unknown[]) => createOrder(...args),
  createOrderConvex: (...args: unknown[]) => createOrderConvex(...args),
}))
jest.mock('@/lib/tenant-supabase-orders', () => ({
  createOrderTenantSupabase: (...args: unknown[]) => createOrderTenantSupabase(...args),
}))
jest.mock('@/lib/supabase/tenant-order-client', () => ({ createTenantOrderWriteClient: () => ({}) }))
jest.mock('@/lib/checkout/order-follow-ups', () => ({ runOrderFollowUps: async () => undefined }))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'deploy-key', loyverse_access_token: null }),
}))

const MENU_ITEMS = [{ id: 'mi-1', name: 'Tapsilog', price: 160, discounted_price: null, is_available: true }]
const items = [{ menu_item_id: 'mi-1', menu_item_name: 'Tapsilog', addons: [], quantity: 2, price: 160, subtotal: 320 }]

function tenantOn(backend: 'platform' | 'convex' | 'supabase') {
  return {
    order_backend: backend,
    is_active: true,
    name: 'Island Silog',
    slug: 'island-silog',
    inventory_enabled: false,
    convex_deployment_url: backend === 'convex' ? 'https://x.convex.cloud' : null,
    supabase_order_url: backend === 'supabase' ? 'https://tenant.supabase.co' : null,
    supabase_order_anon_key: backend === 'supabase' ? 'anon' : null,
    supabase_order_service_key: backend === 'supabase' ? 'service' : null,
    multi_branch_enabled: false,
    lalamove_enabled: false,
    distance_delivery_enabled: false,
    email_notifications_enabled: false,
  }
}

function storedMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: PM_ID,
    name: 'GCash',
    details: '0917 000 0000 (Island Silog)',
    qr_code_url: 'https://ik.imagekit.io/x/store-qr.png',
    is_active: true,
    require_payment_proof: false,
    payment_method_order_types: [{ order_type_id: ORDER_TYPE_ID }],
    ...overrides,
  }
}

type Reply = { success: boolean; refused?: boolean; error?: string }

async function placeOrder(proof?: { url?: string | null; reference?: string | null }): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await createOrderAction(
    TENANT_ID, items, undefined, ORDER_TYPE_ID, {}, undefined, undefined,
    PM_ID, 'Scammer Bank', 'Send to 0999 999 9999', 'https://evil.example.com/qr.png',
    undefined, undefined, proof,
  )) as Reply
}

beforeEach(() => {
  jest.clearAllMocks()
  tableRows = {
    tenants: tenantOn('platform'),
    menu_items: MENU_ITEMS,
    order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
    payment_methods: storedMethod(),
  }
})

const STORED = ['GCash', '0917 000 0000 (Island Silog)', 'https://ik.imagekit.io/x/store-qr.png']

describe('createOrderAction — payment method comes from the store', () => {
  test('platform: records the stored name, details and QR, not the browser’s', async () => {
    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(createOrder).toHaveBeenCalledTimes(1)
    const args = createOrder.mock.calls[0]
    expect(args[7]).toBe(PM_ID)
    expect(args.slice(8, 11)).toEqual(STORED)
  })

  test('convex: records the stored method', async () => {
    tableRows = { ...tableRows, tenants: tenantOn('convex') }

    const result = await placeOrder()

    expect(result.success).toBe(true)
    const args = createOrderConvex.mock.calls[0]
    expect(args[9]).toBe(PM_ID)
    expect(args.slice(10, 13)).toEqual(STORED)
  })

  test('tenant Supabase: records the stored method', async () => {
    tableRows = { ...tableRows, tenants: tenantOn('supabase') }

    const result = await placeOrder()

    expect(result.success).toBe(true)
    const input = createOrderTenantSupabase.mock.calls[0][1] as Record<string, unknown>
    expect(input).toMatchObject({
      paymentMethodId: PM_ID,
      paymentMethodName: STORED[0],
      paymentMethodDetails: STORED[1],
      paymentMethodQrCodeUrl: STORED[2],
    })
  })

  test.each([
    ['not the store’s', null],
    ['switched off', storedMethod({ is_active: false })],
    ['not offered for this order type', storedMethod({ payment_method_order_types: [{ order_type_id: 'other' }] })],
  ])('refuses a method that is %s, before any write', async (_label, row) => {
    tableRows = { ...tableRows, payment_methods: row }

    const result = await placeOrder()

    expect(result).toMatchObject({ success: false, refused: true })
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('an order without a method carries no browser-sent name', async () => {
    const { createOrderAction } = await import('@/app/actions/orders')

    const result = (await createOrderAction(
      TENANT_ID, items, undefined, ORDER_TYPE_ID, {}, undefined, undefined,
      undefined, 'Scammer Bank', 'Send to 0999', 'https://evil.example.com/qr.png',
    )) as Reply

    expect(result.success).toBe(true)
    expect(createOrder.mock.calls[0].slice(7, 11)).toEqual([undefined, undefined, undefined, undefined])
  })

  describe('proof-required method', () => {
    beforeEach(() => {
      tableRows = { ...tableRows, payment_methods: storedMethod({ require_payment_proof: true }) }
    })

    test('refuses an order with neither screenshot nor reference', async () => {
      const result = await placeOrder()

      expect(result).toMatchObject({ success: false, refused: true })
      expect(result.error).toMatch(/screenshot or enter your reference/i)
      expect(createOrder).not.toHaveBeenCalled()
    })

    test('refuses a screenshot that is not an ImageKit upload (it is dropped)', async () => {
      const result = await placeOrder({ url: 'https://evil.example.com/proof.png' })

      expect(result).toMatchObject({ success: false, refused: true })
    })

    test('accepts a reference number', async () => {
      const result = await placeOrder({ reference: 'GCASH-123' })

      expect(result.success).toBe(true)
    })

    test('still applies to an after-billing order type (the details step opens for proof)', async () => {
      tableRows = {
        ...tableRows,
        order_types: { id: ORDER_TYPE_ID, type: 'dine_in', name: 'Dine In', available_on_web: true, after_billing_payment_enabled: true },
      }

      const result = await placeOrder()

      expect(result).toMatchObject({ success: false, refused: true })
    })
  })
})
