/**
 * What happens after an order row exists.
 *
 * Stock depletion stays on the request (the next order's stock guard reads the
 * shelf it leaves behind). The merchant email, the Loyverse receipt and the
 * Regulars-list capture are notifications: the customer is not waiting for
 * them, so they run after the response.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { AfterScheduler } from '@/lib/checkout/after-response'

const applyOrderStockBestEffort = jest.fn(async (...args: unknown[]) => { void args })
const pushOrderToLoyverseBestEffort = jest.fn(async (...args: unknown[]) => { void args; return {} })
const captureOrderCreated = jest.fn(async (...args: unknown[]) => { void args })

jest.mock('@/lib/inventory/order-stock-service', () => ({
  applyOrderStockBestEffort: (...args: unknown[]) => applyOrderStockBestEffort(...args),
}))
jest.mock('@/lib/loyverse/push-service', () => ({
  pushOrderToLoyverseBestEffort: (...args: unknown[]) => pushOrderToLoyverseBestEffort(...args),
}))
jest.mock('@/lib/posthog', () => ({
  captureOrderCreated: (...args: unknown[]) => captureOrderCreated(...args),
}))

const items = [
  { menu_item_id: 'mi-1', menu_item_name: 'Latte', addons: ['Oat'], quantity: 2, price: 100, subtotal: 200, option_ids: ['o1'], addon_ids: ['a1'] },
]

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantConfig: { inventory_enabled: true, email_notifications_enabled: true, admin_email: 'm@x.ph', name: 'Cafe', slug: 'cafe' },
    tenantId: 'tenant-1',
    orderId: 'order-1',
    platformOrderId: 'order-1',
    items,
    outletId: null,
    loyverse: { id: 'tenant-1', loyverse_enabled: true as const, loyverse_access_token: 't', loyverse_store_id: 's', loyverse_payment_type_id: null, loyverse_push_mode: null },
    notice: {
      orderTypeName: 'Pickup',
      deliveryFee: 50,
      serviceCharge: 10,
      paymentMethodName: 'GCash',
      customerData: { name: 'Ana', scheduled_for: '2026-10-03T10:00:00.000Z', scheduled_for_label: 'Today 6 PM' },
    },
    ...overrides,
  }
}

async function load() {
  return import('@/lib/checkout/order-follow-ups')
}

describe('runOrderFollowUps', () => {
  beforeEach(() => {
    applyOrderStockBestEffort.mockClear()
    pushOrderToLoyverseBestEffort.mockClear()
    captureOrderCreated.mockClear()
  })

  test('depletes stock on the request but defers the notifications', async () => {
    // Arrange
    const { runOrderFollowUps } = await load()
    const deferred: Array<() => Promise<void>> = []
    const schedule: AfterScheduler = (task) => { deferred.push(task) }

    // Act
    await runOrderFollowUps(baseInput(), schedule)

    // Assert
    expect(applyOrderStockBestEffort).toHaveBeenCalledTimes(1)
    expect(pushOrderToLoyverseBestEffort).not.toHaveBeenCalled()
    expect(captureOrderCreated).not.toHaveBeenCalled()

    await Promise.all(deferred.map((task) => task()))
    expect(pushOrderToLoyverseBestEffort).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', trigger: 'create' }))
    expect(captureOrderCreated).toHaveBeenCalledTimes(1)
  })

  test('spends stock from the validated branch with the order ids', async () => {
    // Arrange
    const { runOrderFollowUps } = await load()

    // Act
    await runOrderFollowUps(baseInput({ outletId: 'outlet-9' }), () => {})

    // Assert
    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      'tenant-1',
      'order-1',
      [expect.objectContaining({ menuItemId: 'mi-1', quantity: 2, optionIds: ['o1'], addonIds: ['a1'], modifierOptionIds: ['o1', 'a1'] })],
      'sale',
      0,
      'outlet-9',
      { context: { source: 'web_checkout' } },
    )
  })

  test('skips depletion, Loyverse and email for a tenant without them', async () => {
    // Arrange
    const { runOrderFollowUps } = await load()

    // Act
    await runOrderFollowUps(baseInput({
      tenantConfig: { inventory_enabled: false, email_notifications_enabled: false },
      loyverse: null,
    }))

    // Assert
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
    expect(pushOrderToLoyverseBestEffort).not.toHaveBeenCalled()
    expect(captureOrderCreated).not.toHaveBeenCalled()
  })

  test('the merchant email carries the customer total and drops the raw UTC schedule', async () => {
    // Arrange
    const { runOrderFollowUps } = await load()

    // Act — default scheduler: no request scope in jest, so it runs inline.
    await runOrderFollowUps(baseInput())

    // Assert
    const event = captureOrderCreated.mock.calls[0][0] as Record<string, unknown>
    expect(event).toMatchObject({
      tenantId: 'tenant-1',
      tenantName: 'Cafe',
      adminEmail: 'm@x.ph',
      orderId: 'order-1',
      orderTotal: 260,
      deliveryFee: 50,
      orderType: 'Pickup',
      paymentMethod: 'GCash',
      customerData: { name: 'Ana', scheduled_for_label: 'Today 6 PM' },
    })
    expect(event.customerData).not.toHaveProperty('scheduled_for')
  })

  test('runs an extra deferred capture when one is given', async () => {
    // Arrange
    const { runOrderFollowUps } = await load()
    const capture = jest.fn(async () => null)

    // Act
    await runOrderFollowUps(baseInput({ captureCustomer: capture }))

    // Assert
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
