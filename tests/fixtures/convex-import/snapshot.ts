/**
 * A Convex export shaped like the real ones (field names, optional fields,
 * addon objects, legacy and grouped variations, ledger rows) with invented
 * names, numbers and ids — never copy a real customer into the repo.
 *
 * Shared by tests/unit/convex-import/* and the PGlite runner
 * tests/sql/run-convex-import.cjs (which seeds the platform rows below).
 */
import type {
  ConvexOrder,
  ConvexOrderItem,
  ConvexOrderPayment,
  ConvexOrderRevision,
  ConvexProductCost,
  ConvexSnapshot,
  PlatformState,
} from '@/lib/convex-import'

export const TENANT_ID = '11111111-1111-4111-8111-111111111111'
export const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222'
export const SLUG = 'sample-convex-store'

export const DINE_IN = '33333333-3333-4333-8333-333333333301'
export const PICK_UP = '33333333-3333-4333-8333-333333333302'
export const DELETED_TYPE = '33333333-3333-4333-8333-333333333399'
export const FOREIGN_TYPE = '33333333-3333-4333-8333-333333333388'

export const CASH = '44444444-4444-4444-8444-444444444401'
export const GCASH = '44444444-4444-4444-8444-444444444402'

export const OUTLET = '55555555-5555-4555-8555-555555555501'
export const GONE_OUTLET = '55555555-5555-4555-8555-555555555599'

export const MENU = {
  latte: '66666666-6666-4666-8666-666666666601',
  burger: '66666666-6666-4666-8666-666666666602',
  fries: '66666666-6666-4666-8666-666666666603',
  /** Sold in Convex, deleted from the menu since. */
  gone: '66666666-6666-4666-8666-666666666699',
}

export const STAFF = '77777777-7777-4777-8777-777777777701'

/** Platform orders the store took before it moved to Convex. */
export const OLD_PLATFORM_ORDERS = [
  // Same day as the first Convex orders, numbers 1 and 2 → Convex #1 and #2 collide.
  { id: '88888888-8888-4888-8888-888888888801', created_at: '2026-08-01T01:00:00.000Z', order_date: '2026-08-01', daily_number: 1, total: 100, client_order_id: 'pos-shared-sale' },
  { id: '88888888-8888-4888-8888-888888888802', created_at: '2026-08-01T02:00:00.000Z', order_date: '2026-08-01', daily_number: 2, total: 50, client_order_id: null },
  // An older day nobody else uses.
  { id: '88888888-8888-4888-8888-888888888803', created_at: '2026-07-20T03:00:00.000Z', order_date: '2026-07-20', daily_number: 1, total: 75, client_order_id: null },
]

const t = (iso: string) => Date.parse(iso)

let seq = 0
const cid = (prefix: string) => `${prefix}${String(++seq).padStart(4, '0')}fixtureconvexid0000000`

export function buildSnapshot(): ConvexSnapshot {
  seq = 0
  const o1 = cid('k1o') // dine in, cash, paid with a charge, legacy variation, addons
  const o2 = cid('k1o') // grouped variations, unmapped payment method, refund after an edit
  const o3 = cid('k1o') // cancelled
  const o4 = cid('k1o') // register sale projected later (saleOccurredAt), branch, deleted dish
  const o5 = cid('k1o') // same register id as an old platform order → not imported again
  const o6 = cid('k1o') // older Convex bundle: no daily number, deleted order type, gone branch
  const orders: ConvexOrder[] = [
    {
      _id: o1, _creationTime: t('2026-08-01T03:00:00.000Z'), customerName: 'Sample Diner', customerContact: '09000000001',
      customerData: { table_number: '4', sms_consent: false }, total: 245.5, status: 'delivered', orderType: 'Dine In',
      orderTypeId: DINE_IN, source: 'web', dailyNumber: 1, orderDate: '2026-08-01', itemCount: 2, paymentMethod: 'Cash',
      paymentStatus: 'paid', deliveryFee: 0, serviceCharge: 10, amountPaid: 245.5, revisionNumber: 0,
    },
    {
      _id: o2, _creationTime: t('2026-08-01T04:00:00.000Z'), customerName: 'Test Person', customerContact: '09000000002',
      customerData: { discount: { total: 20, lines: [] }, delivery_address: 'Sample Street' }, total: 180, status: 'delivered',
      orderType: 'Pick Up', orderTypeId: PICK_UP, source: 'pos', clientOrderId: 'pos-fixture-2', dailyNumber: 2,
      orderDate: '2026-08-01', itemCount: 1, paymentMethod: 'Maya', paymentStatus: 'paid', amountPaid: 180,
      revisionNumber: 1, editedAt: '2026-08-01T04:30:00.000Z', editedBy: STAFF,
      deliveryLatitude: 14.5, deliveryLongitude: 121.0,
    },
    {
      _id: o3, _creationTime: t('2026-08-01T05:00:00.000Z'), customerName: 'Walk-in', customerContact: '',
      total: 90, status: 'cancelled', orderTypeId: DINE_IN, source: 'web', dailyNumber: 3, orderDate: '2026-08-01',
      itemCount: 1, paymentMethod: 'GCash', paymentStatus: 'pending',
    },
    {
      _id: o4, _creationTime: t('2026-08-03T09:00:00.000Z'), saleOccurredAt: t('2026-08-02T02:15:00.000Z'),
      customerName: 'Branch Guest', customerContact: '09000000004', customerData: { outlet_id: OUTLET },
      total: 300, status: 'delivered', orderTypeId: DINE_IN, source: 'pos', dailyNumber: 1, orderDate: '2026-08-02',
      itemCount: 2, paymentMethod: 'cash', paymentStatus: 'paid', outletId: OUTLET, prepMinutes: 15,
    },
    {
      _id: o5, _creationTime: t('2026-08-01T01:00:05.000Z'), customerName: 'Twin', customerContact: '09000000005',
      total: 100, status: 'delivered', orderTypeId: DINE_IN, source: 'pos', clientOrderId: 'pos-shared-sale',
      dailyNumber: 9, orderDate: '2026-08-01', itemCount: 1, paymentMethod: 'Cash', paymentStatus: 'paid',
    },
    {
      _id: o6, _creationTime: t('2026-07-25T06:00:00.000Z'), customerName: 'Old Bundle', customerContact: '09000000006',
      total: 60, status: 'delivered', orderType: 'Delivery', orderTypeId: DELETED_TYPE, source: 'web', itemCount: 1,
      outletId: GONE_OUTLET, scheduledFor: 'not a date',
    },
  ]
  const items: ConvexOrderItem[] = [
    { _id: cid('k1i'), _creationTime: orders[0]._creationTime, orderId: o1, menuItemId: MENU.latte, menuItemName: 'Latte', quantity: 1, price: 120.5, subtotal: 120.5, variation: 'Large', addons: [{ name: 'Extra shot', price: 25 }] },
    { _id: cid('k1i'), _creationTime: orders[0]._creationTime, orderId: o1, menuItemId: MENU.fries, menuItemName: 'Fries', quantity: 1, price: 115, subtotal: 115, addons: ['Cheese dip'], specialInstructions: 'no salt' },
    { _id: cid('k1i'), _creationTime: orders[1]._creationTime, orderId: o2, menuItemId: MENU.burger, menuItemName: 'Burger', quantity: 2, price: 100, subtotal: 200, variationSelections: [{ typeName: 'Size', optionName: 'Double', priceAdjustment: 30 }, { typeName: 'Spice', optionName: 'Hot', priceAdjustment: 0 }], addons: [{ name: 'Bacon', price: 15, quantity: 2 }], isBundleItem: true, bundleId: 'not-a-uuid', bundleName: 'Meal', slotName: 'Main' },
    { _id: cid('k1i'), _creationTime: orders[2]._creationTime, orderId: o3, menuItemId: MENU.latte, menuItemName: 'Latte', quantity: 1, price: 90, subtotal: 90 },
    { _id: cid('k1i'), _creationTime: orders[3]._creationTime, orderId: o4, menuItemId: MENU.gone, menuItemName: 'Retired Special', quantity: 1, price: 200, subtotal: 200 },
    { _id: cid('k1i'), _creationTime: orders[3]._creationTime, orderId: o4, menuItemId: MENU.fries, menuItemName: 'Fries', quantity: 1, price: 100, subtotal: 100, isUpsellItem: true, presellDate: '2026-08-05' },
    { _id: cid('k1i'), _creationTime: orders[4]._creationTime, orderId: o5, menuItemId: MENU.latte, menuItemName: 'Latte', quantity: 1, price: 100, subtotal: 100 },
    { _id: cid('k1i'), _creationTime: orders[5]._creationTime, orderId: o6, menuItemId: MENU.burger, menuItemName: 'Burger', quantity: 1, price: 60, subtotal: 60 },
    // A line whose order is not in the snapshot at all.
    { _id: cid('k1i'), _creationTime: orders[5]._creationTime, orderId: 'k1o9999missingorder000000000000', menuItemName: 'Ghost', quantity: 1, price: 10, subtotal: 10 },
  ]
  const payments: ConvexOrderPayment[] = [
    { _id: cid('k1p'), _creationTime: orders[0]._creationTime + 1000, orderId: o1, kind: 'charge', amount: 245.5, paymentMethodName: 'Cash' },
    { _id: cid('k1p'), _creationTime: orders[1]._creationTime + 1000, orderId: o2, kind: 'charge', amount: 200, paymentMethodName: 'Maya', reference: 'REF-0001' },
    { _id: cid('k1p'), _creationTime: orders[1]._creationTime + 1_800_000, orderId: o2, kind: 'refund', amount: 20, paymentMethodName: 'Cash', recordedBy: STAFF, note: 'change after edit' },
    // Projected later: business time comes from occurredAt.
    { _id: cid('k1p'), _creationTime: orders[3]._creationTime + 1000, occurredAt: orders[3].saleOccurredAt, orderId: o4, kind: 'charge', amount: 300, paymentMethodId: CASH, outletId: OUTLET },
    { _id: cid('k1p'), _creationTime: orders[4]._creationTime + 1000, orderId: o5, kind: 'charge', amount: 100 },
  ]
  const revisions: ConvexOrderRevision[] = [
    {
      _id: cid('k1r'), _creationTime: orders[1]._creationTime + 1_700_000, orderId: o2, revisionNumber: 1,
      itemsBefore: [{ menuItemName: 'Burger', quantity: 2, price: 100 }], itemsAfter: [{ menuItemName: 'Burger', quantity: 2, price: 90 }],
      totalBefore: 200, totalAfter: 180, reason: 'wrong price', revisedBy: STAFF,
    },
  ]
  const costs: ConvexProductCost[] = [
    { _id: cid('k1c'), _creationTime: t('2026-07-01T00:00:00.000Z'), menuItemId: MENU.latte, costPrice: 42.25, createdAt: t('2026-07-01T00:00:00.000Z'), updatedAt: t('2026-07-02T00:00:00.000Z') },
    { _id: cid('k1c'), _creationTime: t('2026-07-01T00:00:00.000Z'), menuItemId: MENU.gone, costPrice: 50, createdAt: t('2026-07-01T00:00:00.000Z'), updatedAt: t('2026-07-01T00:00:00.000Z') },
    { _id: cid('k1c'), _creationTime: t('2026-07-01T00:00:00.000Z'), menuItemId: MENU.burger, costPrice: 55, createdAt: t('2026-07-01T00:00:00.000Z'), updatedAt: t('2026-07-01T00:00:00.000Z') },
  ]
  return {
    orders,
    orderItems: items,
    orderPayments: payments,
    orderRevisions: revisions,
    productCosts: costs,
    tenantConfig: [{ _id: cid('k1t'), _creationTime: 0, key: 'tenant_id', value: TENANT_ID }],
    tableCounts: {
      orders: orders.length,
      orderItems: items.length,
      orderPayments: payments.length,
      orderRevisions: revisions.length,
      productCosts: costs.length,
      tenantConfig: 1,
      analyticsEvents: 12,
      productAnalytics: 4,
      pushTokens: 2,
      dailyOrderCounters: 3,
      dailyStats: 0,
    },
  }
}

export function buildPlatformState(overrides: Partial<PlatformState> = {}): PlatformState {
  return {
    tenant: {
      id: TENANT_ID,
      slug: SLUG,
      orderBackend: 'convex',
      convexDeploymentUrl: 'https://sample-fixture-123.convex.cloud',
      loyaltyEnabled: false,
      loyaltyShadow: true,
      timezone: 'Asia/Manila',
    },
    menuItemIds: [MENU.latte, MENU.burger, MENU.fries],
    orderTypes: [
      { id: DINE_IN, tenantId: TENANT_ID, name: 'Dine In' },
      { id: PICK_UP, tenantId: TENANT_ID, name: 'Pick Up' },
      { id: FOREIGN_TYPE, tenantId: OTHER_TENANT_ID, name: 'Dine In' },
    ],
    paymentMethods: [
      { id: CASH, name: 'Cash' },
      { id: GCASH, name: 'GCash' },
    ],
    outletIds: [OUTLET],
    existingOrders: OLD_PLATFORM_ORDERS.map((order) => ({
      id: order.id,
      clientOrderId: order.client_order_id,
      orderDate: order.order_date,
      dailyNumber: order.daily_number,
      createdAt: order.created_at,
    })),
    productCostMenuItemIds: [MENU.burger],
    convexKeyed: {
      order_stock_applications: [],
      simple_option_stock_applications: [],
      simple_option_stock_movements: [],
      presell_stock_applications: [],
      stock_movements: [],
    },
    untouchedKeyed: {},
    customerLinkedConvexIds: [],
    activityPlacedConvexIds: [],
    ...overrides,
  }
}
