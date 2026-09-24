/**
 * "Add your number to this order" on a tracking page for an order whose
 * customer already typed their number at checkout.
 *
 * `hasContact` decides whether the tracking page shows the phone-capture card.
 * It was resolved from four hard-coded `customer_data` keys, but merchants name
 * their own checkout fields — "Contact Number", "Phone number", "Mobile
 * Number". For roughly two dozen live order types the number therefore looked
 * absent, the order was even stored with a blank `customer_contact`, and the
 * page asked for a number the customer had already given.
 *
 * `hasContact` must be true whenever the order actually carries a reachable
 * number, and must stay false when it genuinely does not.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)

const BASE_ROW = {
  id: ORDER_ID,
  status: 'preparing',
  total: 250,
  delivery_fee: 0,
  service_charge_amount: 0,
  order_type: 'Delivery',
  order_type_id: null,
  customer_name: 'Ana',
  // Blank exactly as the write path left it: the checkout could not find the
  // phone under a well-known key either.
  customer_contact: '',
  outlet_id: null,
  source: 'online',
  payment_status: 'pending',
  created_at: '2026-09-21T10:00:00.000Z',
  daily_number: 7,
  scheduled_for: null,
  customer_data: {} as Record<string, unknown>,
  order_items: [
    { menu_item_name: 'Latte', quantity: 1, price: 250, subtotal: 250, variation: null, addons: null },
  ],
}

let orderRow: Record<string, unknown> = BASE_ROW

function makeAdminClient() {
  return {
    from: (table: string) => {
      let columns = ''
      const builder = {
        select: (cols: string) => { columns = cols; return builder },
        eq: () => builder,
        single: async () => respond(table, columns),
        maybeSingle: async () => respond(table, columns),
      }
      return builder
    },
  }
}

function respond(table: string, columns: string) {
  if (table === 'tenants') {
    // One read carries both the routing columns and the pickup switch.
    return { data: { order_backend: 'platform', convex_deployment_url: null, pickup_scan_enabled: true }, error: null }
  }
  if (table === 'orders') return { data: orderRow, error: null }
  return { data: null, error: null }
}

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }))
jest.mock('@/lib/tracking-token', () => ({
  verifyTrackingToken: () => true,
  MIN_TRACKING_TOKEN_HEX: 20,
}))

/** next/jest leaves static imports ahead of `jest.mock` — import lazily. */
async function fetchTracking() {
  const { fetchOrderTrackingData } = await import('@/lib/order-tracking-service')
  return fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
}

function withCustomerData(customerData: Record<string, unknown>) {
  orderRow = { ...BASE_ROW, customer_data: customerData }
}

describe('tracking page contact detection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    orderRow = BASE_ROW
  })

  it('reports a contact when the tenant named its phone field "Contact Number"', async () => {
    // Arrange
    withCustomerData({ 'Customer Name': 'Ana', 'Contact Number': '09171234567' })

    // Act
    const { data } = await fetchTracking()

    // Assert — the capture card must not ask for a number already on the order
    expect(data?.hasContact).toBe(true)
  })

  it('reports a contact when the field is named "Mobile Number"', async () => {
    withCustomerData({ 'Mobile Number': '0917 123 4567' })
    const { data } = await fetchTracking()
    expect(data?.hasContact).toBe(true)
  })

  it('still asks when the order carries no reachable number', async () => {
    // Arrange — a dine-in form with only a name and a table
    withCustomerData({ customer_name: 'Ana', table_number: '12' })

    // Act
    const { data } = await fetchTracking()

    // Assert
    expect(data?.hasContact).toBe(false)
  })

  it('keeps recognizing the well-known customer_phone key', async () => {
    withCustomerData({ customer_phone: '+639171234567' })
    const { data } = await fetchTracking()
    expect(data?.hasContact).toBe(true)
  })
})
