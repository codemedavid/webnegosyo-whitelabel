/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createOrderPinLink, DELIVERY_EDIT_PLATFORM_ONLY_MESSAGE, PIN_LINK_UNAVAILABLE_MESSAGE, saveOrderDeliveryEdit } from '@/lib/delivery/order-delivery-edit-server'
import { DELIVERY_EDIT_BOOKED_MESSAGE } from '@/lib/delivery/order-delivery-edit'
import { verifyPinLinkToken } from '@/lib/delivery/pin-link-token'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-11-06T01:02:03.123456+00:00'

const STORE = {
  id: TENANT,
  slug: 'shop',
  order_backend: 'platform',
  convex_deployment_url: null,
  lalamove_enabled: true,
  lalamove_market: 'PH',
  restaurant_address: 'Store',
  restaurant_latitude: 14.5,
  restaurant_longitude: 121.1,
  delivery_radius_km: null,
  multi_branch_enabled: false,
}

const ORDER_ROW = {
  id: ORDER,
  status: 'pending',
  outlet_id: null,
  customer_data: { delivery_address: 'Purok 3', Phone: '0917' },
  lalamove_order_id: null,
  lalamove_status: null,
  updated_at: UPDATED_AT,
}

interface Options {
  store?: Record<string, unknown> | null
  order?: Record<string, unknown> | null
  updated?: { id: string } | null
  updateError?: { message: string } | null
}

function fakeClient({ store = STORE, order = ORDER_ROW, updated = { id: ORDER }, updateError = null }: Options = {}) {
  const updates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = []
    let payload: Record<string, unknown> | null = null
    const builder = {
      select: () => builder,
      update: (next: Record<string, unknown>) => {
        payload = next
        return builder
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return builder
      },
      maybeSingle: async () => {
        if (payload) {
          updates.push({ payload, filters })
          return { data: updated, error: updateError }
        }
        return { data: table === 'tenants' ? store : order, error: null }
      },
    }
    return builder
  }
  return { client: { from } as unknown as SupabaseClient<Database>, updates }
}

const input = { tenantId: TENANT, orderId: ORDER, editor: 'merchant' as const, now: new Date('2026-11-06T00:00:00Z') }

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

describe('saveOrderDeliveryEdit', () => {
  it('writes the new answers, and only if the order is as it was read', async () => {
    const { client, updates } = fakeClient()
    const result = await saveOrderDeliveryEdit(client, { ...input, patch: { storeNote: 'Fragile' } })

    expect(result).toEqual({ ok: true, customerData: { delivery_address: 'Purok 3', Phone: '0917', delivery_store_note: 'Fragile' } })
    expect(updates[0].filters).toEqual([['id', ORDER], ['tenant_id', TENANT], ['updated_at', UPDATED_AT]])
    expect(updates[0].payload).not.toHaveProperty('lalamove_quotation_id')
  })

  it('drops the quotation when the destination moves, so the old spot can never be booked', async () => {
    const { client, updates } = fakeClient()
    const result = await saveOrderDeliveryEdit(client, { ...input, patch: { pin: { lat: 14.6, lng: 121.1 } } })

    expect(result.ok).toBe(true)
    expect(updates[0].payload.lalamove_quotation_id).toBeNull()
    expect(updates[0].payload.customer_data).toMatchObject({ delivery_lat: '14.6', delivery_pin_updated_by: 'merchant' })
    expect((updates[0].payload.customer_data as Record<string, unknown>).delivery_pin_km).toBe('11.1')
  })

  it('never writes the fee', async () => {
    const { client, updates } = fakeClient()
    await saveOrderDeliveryEdit(client, { ...input, patch: { pin: { lat: 14.6, lng: 121.1 } } })
    expect(Object.keys(updates[0].payload).sort()).toEqual(['customer_data', 'lalamove_quotation_id'])
  })

  it('reports a lost race instead of pretending it saved (zero rows, no error)', async () => {
    const { client } = fakeClient({ updated: null })
    expect(await saveOrderDeliveryEdit(client, { ...input, patch: { unit: '5B' } })).toEqual({ ok: false, status: 409, error: 'This order just changed. Please try again.' })
  })

  it('refuses while a rider is booked, without writing', async () => {
    const { client, updates } = fakeClient({ order: { ...ORDER_ROW, lalamove_order_id: '123', lalamove_status: 'ON_GOING' } })
    expect(await saveOrderDeliveryEdit(client, { ...input, patch: { unit: '5B' } })).toEqual({ ok: false, status: 409, error: DELIVERY_EDIT_BOOKED_MESSAGE })
    expect(updates).toEqual([])
  })

  it('refuses a pin outside the country on a Philippine store', async () => {
    const { client, updates } = fakeClient()
    const result = await saveOrderDeliveryEdit(client, { ...input, patch: { pin: { lat: 22.3, lng: 114.17 } } })
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(updates).toEqual([])
  })

  it('stays out of Convex stores, whose orders are not here', async () => {
    const { client, updates } = fakeClient({ store: { ...STORE, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' } })
    expect(await saveOrderDeliveryEdit(client, { ...input, patch: { unit: '5B' } })).toEqual({ ok: false, status: 409, error: DELIVERY_EDIT_PLATFORM_ONLY_MESSAGE })
    expect(updates).toEqual([])
  })

  it("treats another branch's order as missing", async () => {
    const { client, updates } = fakeClient({ order: { ...ORDER_ROW, outlet_id: 'branch-b' } })
    const result = await saveOrderDeliveryEdit(client, { ...input, patch: { unit: '5B' }, isOutletInScope: (outletId) => outletId === 'branch-a' })
    expect(result).toEqual({ ok: false, status: 404, error: 'Order not found.' })
    expect(updates).toEqual([])
  })

  it('answers a missing order and a read failure plainly', async () => {
    expect(await saveOrderDeliveryEdit(fakeClient({ order: null }).client, { ...input, patch: { unit: '5B' } })).toMatchObject({ ok: false, status: 404 })
    expect(await saveOrderDeliveryEdit(fakeClient({ updateError: { message: 'boom' } }).client, { ...input, patch: { unit: '5B' } })).toMatchObject({ ok: false, status: 503 })
  })
})

describe('createOrderPinLink', () => {
  const OLD_SECRET = process.env.API_SECRET
  beforeAll(() => {
    process.env.API_SECRET = 'test-secret'
  })
  afterAll(() => {
    process.env.API_SECRET = OLD_SECRET
  })

  it('signs a link under the store for this order', async () => {
    const result = await createOrderPinLink(fakeClient().client, { tenantId: TENANT, orderId: ORDER, origin: 'https://www.example.com' })
    if (!result.ok) throw new Error(result.error)
    const url = new URL(result.url)
    expect(url.pathname).toBe(`/shop/pin/${ORDER}`)
    expect(verifyPinLinkToken(ORDER, url.searchParams.get('t') ?? '')).toBe(true)
  })

  it('refuses when the order can no longer change', async () => {
    const result = await createOrderPinLink(fakeClient({ order: { ...ORDER_ROW, status: 'delivered' } }).client, { tenantId: TENANT, orderId: ORDER, origin: 'https://x' })
    expect(result).toMatchObject({ ok: false, status: 409 })
  })

  it('answers 503 with a logged reason, not a crash, when API_SECRET is missing', async () => {
    delete process.env.API_SECRET
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await createOrderPinLink(fakeClient().client, { tenantId: TENANT, orderId: ORDER, origin: 'https://x' })
      expect(result).toEqual({ ok: false, status: 503, error: PIN_LINK_UNAVAILABLE_MESSAGE })
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('[delivery-edit]'), expect.stringContaining('API_SECRET'))
    } finally {
      logged.mockRestore()
      process.env.API_SECRET = 'test-secret'
    }
  })
})
