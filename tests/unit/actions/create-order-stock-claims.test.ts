/**
 * Simple-option counters ("Pearls: 5 left") and the order rate limit.
 *
 * The counter check used to be an unlocked read before the order, and the
 * locked counter write ran only AFTER the order row existed — where its
 * "Insufficient stock" was swallowed. Two diners racing for the last Pearls
 * both got an order, and the second one never came off the counter. Now the
 * counters are CLAIMED before the order is written, under the id the order is
 * then written with (so the post-order depletion finds the claim already taken
 * and cannot spend it twice), and handed back whenever no order row ends up
 * owning them — exactly like the presell claim.
 *
 * Lines that name an add-on only as TEXT are charged for it by name; they now
 * carry its id too, so the counter claim and the stored lines see it.
 *
 * Note the repo gotcha: jest.mock is NOT hoisted here, so the module under
 * test is imported lazily inside each test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'
const MENU_ITEM_ID = 'mi-tea'

let tableRows: Record<string, unknown> = {}

function makeQuery(table: string) {
  const result = { data: tableRows[table] ?? null, error: null }
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
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: async () => null }))

jest.mock('@/lib/inventory/checkout-stock-guard', () => ({
  findCheckoutStockShortfallMessage: async () => null,
}))

jest.mock('@/lib/presell/order-claim', () => ({
  claimPresellForOrder: async () => ({ ok: true as const, lines: [] }),
  releasePresellForOrder: async () => {},
}))

const applySimpleOptionStock = jest.fn()
const assertSimpleOptionStockAvailable = jest.fn()
jest.mock('@/lib/inventory/simple-option-stock-service', () => ({
  applySimpleOptionStock: (...args: unknown[]) =>
    (applySimpleOptionStock as unknown as (...a: unknown[]) => unknown)(...args),
  assertSimpleOptionStockAvailable: (...args: unknown[]) =>
    (assertSimpleOptionStockAvailable as unknown as (...a: unknown[]) => unknown)(...args),
}))

const runOrderFollowUps = jest.fn(async () => {})
jest.mock('@/lib/checkout/order-follow-ups', () => ({
  runOrderFollowUps: (...args: unknown[]) =>
    (runOrderFollowUps as unknown as (...a: unknown[]) => unknown)(...args),
}))

const checkOrderRateLimit = jest.fn()
jest.mock('@/lib/action-rate-limit', () => ({
  checkOrderRateLimit: (...args: unknown[]) =>
    (checkOrderRateLimit as unknown as (...a: unknown[]) => unknown)(...args),
}))

const createOrder = jest.fn()
jest.mock('@/lib/orders-service', () => ({
  getOrdersByTenant: async () => [],
  getOrderById: async () => null,
  updateOrderStatus: async () => null,
  getOrderStats: async () => null,
  createOrder: (...args: unknown[]) => (createOrder as unknown as (...a: unknown[]) => unknown)(...args),
  createOrderConvex: async () => {
    throw new Error('not used')
  },
}))

jest.mock('@/lib/vouchers/order-pricing', () => ({
  priceOrderWithVouchers: async () => ({ application: { discountLines: [] }, discountPayload: null, redemptions: [] }),
}))
jest.mock('@/lib/vouchers/repository', () => ({ createVoucherLookup: () => ({}) }))
jest.mock('@/lib/vouchers/order-voucher-flow', () => ({
  burnRedemptions: async () => ({ failures: [] }),
  loadCategoryMap: async () => ({}),
}))

const milkTea = {
  id: MENU_ITEM_ID,
  name: 'Milk Tea',
  price: 100,
  discounted_price: null,
  is_available: true,
  modifier_groups: [{
    id: 'g-top', name: 'Toppings', selection_mode: 'quantity', display_order: 0, min_select: 0, max_select: null,
    options: [{ id: 'a-pearls', name: 'Pearls', price_modifier: 15, display_order: 0, stock_mode: 'simple', stock_qty: 5 }],
  }],
}

/** Sent by an older client: the add-on as text only, no ids. */
const textOnlyLine = {
  menu_item_id: MENU_ITEM_ID,
  menu_item_name: 'Milk Tea',
  addons: ['Pearls'],
  quantity: 2,
  price: 115,
  subtotal: 230,
}

type Reply = { success: boolean; refused?: boolean; error?: string }

async function placeOrder(): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await createOrderAction(TENANT_ID, [textOnlyLine], undefined, ORDER_TYPE_ID)) as Reply
}

type ApplyCall = [unknown, string, string, string, number?, Array<Record<string, unknown>>?, (string | null)?]
const applyCalls = () => applySimpleOptionStock.mock.calls as unknown as ApplyCall[]
const callsFor = (action: string) => applyCalls().filter((call) => call[3] === action)
const createOrderParity = () =>
  (createOrder.mock.calls[0] as unknown[])[16] as { orderId?: string } | undefined

describe('createOrderAction — simple-option counters are claimed before the order', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    checkOrderRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterSec: 0 }))
    applySimpleOptionStock.mockImplementation(async () => 1)
    assertSimpleOptionStockAvailable.mockImplementation(async () => {})
    createOrder.mockImplementation(async () => ({ order: { id: 'unused', total: 230 }, orderToken: 'tok', deduped: false }))
    tableRows = {
      tenants: {
        order_backend: 'platform', is_active: true, name: 'Tea Spot', slug: 'tea-spot',
        inventory_enabled: true, convex_deployment_url: null, multi_branch_enabled: false,
        lalamove_enabled: false, distance_delivery_enabled: false, email_notifications_enabled: false,
      },
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
      menu_items: [milkTea],
    }
  })

  test('claims under the very id the order is then written with, before writing it', async () => {
    const order: string[] = []
    applySimpleOptionStock.mockImplementation(async () => { order.push('claim'); return 1 })
    createOrder.mockImplementation(async () => {
      order.push('write')
      return { order: { id: createOrderParity()?.orderId, total: 230 }, orderToken: 'tok', deduped: false }
    })

    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(order).toEqual(['claim', 'write'])
    const [claim] = callsFor('sale')
    expect(claim[1]).toBe(TENANT_ID)
    expect(claim[4]).toBe(0)
    expect(typeof claim[2]).toBe('string')
    expect(createOrderParity()?.orderId).toBe(claim[2])
    // No unlocked read on the platform path — the claim IS the check.
    expect(assertSimpleOptionStockAvailable).not.toHaveBeenCalled()
  })

  test('an add-on named only as text is claimed and stored with its id', async () => {
    await placeOrder()

    const [claim] = callsFor('sale')
    expect(claim[5]?.[0]).toMatchObject({ menuItemId: MENU_ITEM_ID, quantity: 2, addonIds: ['a-pearls'] })
    const storedLines = (createOrder.mock.calls[0] as unknown[])[1] as Array<{ addon_ids?: string[] }>
    expect(storedLines[0].addon_ids).toEqual(['a-pearls'])
  })

  test('refuses — without writing an order — when the counter runs out', async () => {
    applySimpleOptionStock.mockImplementation(async () => {
      throw { message: 'Insufficient stock for Pearls', code: 'P0001' }
    })

    const result = await placeOrder()

    expect(result).toMatchObject({ success: false, refused: true })
    expect(result.error).toMatch(/Pearls/)
    expect(result.error).not.toMatch(/Insufficient/)
    expect(createOrder).not.toHaveBeenCalled()
    expect(callsFor('cancel')).toHaveLength(0)
  })

  test('hands the counters back when the order is never written', async () => {
    createOrder.mockImplementation(async () => { throw new Error('network') })

    const result = await placeOrder()

    expect(result.success).toBe(false)
    expect(result.refused).toBeUndefined()
    expect(callsFor('cancel')).toHaveLength(1)
    expect(callsFor('cancel')[0][2]).toBe(callsFor('sale')[0][2])
  })

  test('hands back the second claim a deduped retry just took', async () => {
    createOrder.mockImplementation(async () => ({ order: { id: 'first-attempt', total: 230 }, orderToken: 'tok', deduped: true }))

    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(callsFor('cancel')).toHaveLength(1)
    expect(callsFor('cancel')[0][2]).toBe(callsFor('sale')[0][2])
  })

  test('keeps the claim once the order is saved', async () => {
    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(callsFor('cancel')).toHaveLength(0)
  })

  test('a claim that fails for another reason does not cost the sale', async () => {
    // The transaction rolled back, so the post-order depletion retries it
    // under the same id — today's behaviour, never a refused order.
    applySimpleOptionStock.mockImplementation(async () => { throw new Error('fetch failed') })

    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(createOrder).toHaveBeenCalledTimes(1)
  })

  test('claims nothing for a store without inventory', async () => {
    tableRows = { ...tableRows, tenants: { ...(tableRows.tenants as object), inventory_enabled: false } }

    await placeOrder()

    expect(applySimpleOptionStock).not.toHaveBeenCalled()
  })
})

describe('createOrderAction — order rate limit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createOrder.mockImplementation(async () => ({ order: { id: 'o1', total: 230 }, orderToken: 'tok', deduped: false }))
  })

  test('is counted per store (the limiter adds the client address)', async () => {
    checkOrderRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterSec: 0 }))

    await placeOrder()

    expect(checkOrderRateLimit).toHaveBeenCalledWith(TENANT_ID)
  })

  test('past the allowance the order is refused, kindly, before anything is read', async () => {
    checkOrderRateLimit.mockImplementation(async () => ({ allowed: false, retryAfterSec: 30 }))

    const result = await placeOrder()

    expect(result).toMatchObject({ success: false, refused: true })
    expect(result.error).toMatch(/try again/i)
    expect(createOrder).not.toHaveBeenCalled()
    expect(applySimpleOptionStock).not.toHaveBeenCalled()
  })
})
