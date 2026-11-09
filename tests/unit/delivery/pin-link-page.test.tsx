/** @jest-environment node */
import type { ReactElement } from 'react'

/**
 * The pin page is public and its link gets forwarded: it may show the store
 * and the order number, never who ordered, their phone, items or current spot.
 */

const STORE = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Karamotan Grill',
  order_backend: 'platform',
  convex_deployment_url: null,
  mapbox_enabled: true,
  lalamove_enabled: true,
  lalamove_market: 'PH_MNL',
  restaurant_address: 'Tanza, Cavite',
  restaurant_latitude: 14.39,
  restaurant_longitude: 120.85,
  delivery_radius_km: 8,
}
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
let order: Record<string, unknown> | null

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const row = table === 'tenants' ? STORE : order
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))
jest.mock('@/components/shared/address-autocomplete', () => ({ AddressAutocomplete: () => null }))

const OLD_SECRET = process.env.API_SECRET
beforeAll(() => {
  process.env.API_SECRET = 'test-secret'
})
afterAll(() => {
  process.env.API_SECRET = OLD_SECRET
})
beforeEach(() => {
  order = {
    status: 'pending',
    daily_number: 7,
    lalamove_order_id: null,
    lalamove_status: null,
    customer_name: 'Maria Santos',
    customer_contact: '09171234567',
    customer_data: { delivery_address: 'Blk 4 Lot 12 Camella', delivery_lat: '14.4', delivery_lng: '120.9', Phone: '09171234567' },
  }
})

async function renderPage(token: string, slug = 'karamotan') {
  const { default: PinLinkPage } = await import('@/app/[tenant]/pin/[orderId]/page')
  return (await PinLinkPage({ params: Promise.resolve({ tenant: slug, orderId: ORDER_ID }), searchParams: Promise.resolve({ t: token }) })) as ReactElement<Record<string, unknown>>
}

async function token(): Promise<string> {
  const { createPinLinkToken } = await import('@/lib/delivery/pin-link-token')
  return createPinLinkToken(ORDER_ID)
}

describe('pin link page', () => {
  it('hands the form only the store, the order number and the map settings', async () => {
    const element = await renderPage(await token())
    const props = element.props
    expect(props).toMatchObject({ storeName: 'Karamotan Grill', orderNumber: 7, keepsAddress: true })
    const serialized = JSON.stringify(props)
    for (const secret of ['Maria', '0917', 'Blk 4', 'Camella', '120.9']) expect(serialized).not.toContain(secret)
  })

  it('shows the expired message for a bad token, without reading the order', async () => {
    const element = await renderPage('123.abc')
    expect(JSON.stringify(element.props)).toContain('expired')
    expect(element.props).not.toHaveProperty('storeName')
  })

  it('refuses a finished order', async () => {
    order = { ...order, status: 'delivered' }
    const element = await renderPage(await token())
    expect(element.props).not.toHaveProperty('tenantId')
    expect(JSON.stringify(element.props)).toContain('can no longer change')
  })

  it('treats an order of another store as missing', async () => {
    order = null
    const element = await renderPage(await token(), 'other-store')
    expect(element.props).not.toHaveProperty('tenantId')
  })
})
