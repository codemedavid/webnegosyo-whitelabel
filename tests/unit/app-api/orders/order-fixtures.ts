import type { AppOrderDraft } from '@/lib/app-contract'
import type { OrderSummary, PlacedOrderRow } from '@/lib/app-api/orders/order-index'
import type { PlacedOrder } from '@/lib/checkout/place-order/types'

/** Shared fixtures for the app order tests (not a test file: no `.test.`). */

export const TENANT = '00000000-0000-4000-8000-000000000001'
export const CUSTOMER = '77777777-7777-4777-8777-777777777777'
export const OTHER_CUSTOMER = '88888888-8888-4888-8888-888888888888'
export const DISH = '11111111-1111-4111-8111-111111111111'
export const SIZE_GROUP = 'size'
export const LARGE = 'large'
export const PICKUP_TYPE = '22222222-2222-4222-8222-222222222222'
export const DELIVERY_TYPE = '33333333-3333-4333-8333-333333333333'
export const CASH = '44444444-4444-4444-8444-444444444444'
export const GCASH = '55555555-5555-4555-8555-555555555555'
export const KEY = 'attempt-0001-abcdef'

export const SUMMARY: OrderSummary = {
  lines: [{ itemId: DISH, name: 'Iced Latte', quantity: 2, options: ['Large'], lineTotal: 240, selections: { [SIZE_GROUP]: { [LARGE]: 1 } } }],
  totals: { subtotal: 240, discount: 0, serviceCharge: 0, deliveryFee: 0, total: 240 },
  orderKind: 'pickup',
  orderTypeName: 'Pick Up',
  outletName: null,
  number: '07',
  paymentMethodName: 'Cash',
}

export function placedRow(overrides: Partial<PlacedOrderRow> = {}): PlacedOrderRow {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    tenantId: TENANT,
    appId: TENANT,
    customerId: CUSTOMER,
    backend: 'platform',
    orderId: 'order-1',
    idempotencyKey: KEY,
    state: 'placed',
    summary: SUMMARY,
    lastStatus: 'pending',
    lastStatusAt: '2026-11-04T10:00:00.000Z',
    placedAt: '2026-11-04 10:00:00.123456+00',
    createdAt: '2026-11-04T10:00:00.000Z',
    ...overrides,
  }
}

export function draft(overrides: Partial<AppOrderDraft> = {}): AppOrderDraft {
  return {
    orderTypeId: PICKUP_TYPE,
    outletId: null,
    lines: [{ itemId: DISH, quantity: 2, selections: { [SIZE_GROUP]: { [LARGE]: 1 } } }],
    paymentMethodId: CASH,
    paymentReference: null,
    voucherCode: null,
    rewardId: null,
    delivery: null,
    notes: '',
    ...overrides,
  }
}

export function placedResult(overrides: Partial<PlacedOrder> = {}): PlacedOrder {
  return {
    kind: 'placed',
    order: { id: 'order-1', daily_number: 7 } as unknown as PlacedOrder['order'],
    orderToken: 'token',
    trackingToken: 'tracking',
    deduped: false,
    backend: 'platform',
    pricing: { itemsSubtotal: 240, discountTotal: 0, serviceCharge: 0, deliveryFee: 0, total: 240 },
    lines: [{ menu_item_id: DISH, name: 'Iced Latte', quantity: 2, price: 120, subtotal: 240, variation: 'Large', addons: [] }],
    ...overrides,
  }
}

export const silentLog = { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
