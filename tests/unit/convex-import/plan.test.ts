import { buildImportPlan, hasBlockingProblem, localDate, uuidV5 } from '@/lib/convex-import'
import {
  buildPlatformState,
  buildSnapshot,
  CASH,
  DINE_IN,
  FOREIGN_TYPE,
  GCASH,
  MENU,
  OLD_PLATFORM_ORDERS,
  OUTLET,
  OTHER_TENANT_ID,
  PICK_UP,
  STAFF,
  TENANT_ID,
} from '../../fixtures/convex-import/snapshot'

const plan = () => buildImportPlan(buildSnapshot(), buildPlatformState())
const byConvexId = (p: ReturnType<typeof plan>, convexId: string) => p.rows.orders.find((row) => row.customer_data.convex_order_id === convexId)!
const problem = (p: ReturnType<typeof plan>, code: string) => p.problems.find((x) => x.code === code)

describe('buildImportPlan: orders', () => {
  it('keys every row by UUID v5 of the Convex id and keeps the Convex id as provenance', () => {
    const p = plan()
    const snapshot = buildSnapshot()
    for (const row of p.rows.orders) {
      expect(row.id).toBe(uuidV5(String(row.customer_data.convex_order_id)))
      expect(row.tenant_id).toBe(TENANT_ID)
    }
    expect(p.rows.order_items.every((item) => snapshot.orderItems.some((x) => uuidV5(x._id) === item.id))).toBe(true)
  })

  it('inserts in business-time order and dates a projected register sale at saleOccurredAt', () => {
    const p = plan()
    const times = p.rows.orders.map((row) => row.created_at)
    expect([...times].sort()).toEqual(times)
    const projected = byConvexId(p, buildSnapshot().orders[3]._id)
    expect(projected.created_at).toBe('2026-08-02T02:15:00.000Z')
    expect(projected.updated_at).toBe(projected.created_at)
    const charge = p.rows.order_payments.find((x) => x.order_id === projected.id)!
    expect(charge.created_at).toBe('2026-08-02T02:15:00.000Z')
  })

  it('maps money to whole centavos and the totals match by hand', () => {
    const { summary } = plan()
    expect(summary.orders).toEqual({ count: 5, cents: 87550, cancelled: { count: 1, cents: 9000 }, amountPaidCents: 72550 })
    expect(summary.items).toMatchObject({ count: 7, cents: 88550, quantity: 8, nulledMenuLinks: 1 })
    expect(summary.payments).toEqual({ charges: { count: 3, cents: 74550 }, refunds: { count: 1, cents: 2000 } })
    expect(summary.revisions.count).toBe(1)
    expect(summary.firstOrderAt).toBe('2026-07-25T06:00:00.000Z')
    expect(summary.lastOrderAt).toBe('2026-08-02T02:15:00.000Z')
    expect(summary.tradingDays).toBe(3)
  })

  it('keeps a cancelled order with its total and status', () => {
    const cancelled = byConvexId(plan(), buildSnapshot().orders[2]._id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.total).toBe(90)
    expect(cancelled.payment_method_id).toBe(GCASH)
    expect(cancelled.customer_contact).toBeNull() // '' → null
  })

  it('carries the branch, service charge, discount, delivery pin and editor', () => {
    const snapshot = buildSnapshot()
    const p = plan()
    const branch = byConvexId(p, snapshot.orders[3]._id)
    expect(branch.outlet_id).toBe(OUTLET)
    expect(branch.prep_minutes).toBe(15)
    expect(branch.payment_method_id).toBe(CASH) // 'cash' matches 'Cash'
    const first = byConvexId(p, snapshot.orders[0]._id)
    expect(first.service_charge_amount).toBe(10)
    expect(first.order_type_id).toBe(DINE_IN)
    const edited = byConvexId(p, snapshot.orders[1]._id)
    expect(edited.discount_data).toEqual({ total: 20, lines: [] })
    expect(edited.discount_total).toBe(20)
    expect(edited.customer_data.delivery_lat).toBe('14.5')
    expect(edited.customer_data.delivery_lng).toBe('121')
    expect(edited.customer_data.delivery_address).toBe('Sample Street')
    expect(edited.edited_by).toBe(STAFF)
    expect(edited.revision_number).toBe(1)
    expect(edited.order_type_id).toBe(PICK_UP)
  })

  it('drops links that no longer exist and keeps the names', () => {
    const p = plan()
    const old = byConvexId(p, buildSnapshot().orders[5]._id)
    expect(old.order_type_id).toBeNull()
    expect(old.order_type).toBe('Delivery')
    expect(old.outlet_id).toBeNull()
    expect(old.scheduled_for).toBeNull()
    expect(old.payment_status).toBe('pending')
    expect(problem(p, 'order_type_missing')?.severity).toBe('warn')
    expect(problem(p, 'unknown_outlet')?.count).toBe(1)
    expect(problem(p, 'unparsed_timestamp')?.count).toBe(1)
  })

  it('names unmapped payment methods, keeps the name, leaves the id empty', () => {
    const p = plan()
    const maya = byConvexId(p, buildSnapshot().orders[1]._id)
    expect(maya.payment_method_id).toBeNull()
    expect(maya.payment_method_name).toBe('Maya')
    expect(p.summary.unmappedPaymentMethods).toEqual([{ name: 'Maya', orders: 1 }])
    expect(problem(p, 'unmapped_payment_method')).toMatchObject({ severity: 'warn', count: 1 })
  })
})

describe('buildImportPlan: daily numbers next to older platform orders', () => {
  it('keeps Convex numbers and renumbers only collisions after both sets', () => {
    const p = plan()
    const snapshot = buildSnapshot()
    const n = (i: number) => byConvexId(p, snapshot.orders[i]._id)
    expect([n(0).order_date, n(0).daily_number]).toEqual(['2026-08-01', 4])
    expect(n(0).customer_data.convex_daily_number).toBe(1)
    expect([n(1).order_date, n(1).daily_number]).toEqual(['2026-08-01', 5])
    expect([n(2).order_date, n(2).daily_number]).toEqual(['2026-08-01', 3])
    expect(n(2).customer_data.convex_daily_number).toBeUndefined()
    expect([n(3).order_date, n(3).daily_number]).toEqual(['2026-08-02', 1])
    // An old bundle without numbers: no number, its Manila business date.
    expect([n(5).order_date, n(5).daily_number]).toEqual(['2026-07-25', null])
    expect(p.summary.renumbered).toBe(2)
    expect(p.summary.daysSharedWithPlatform).toBe(1)
    expect(p.summary.existingPlatformOrders).toBe(OLD_PLATFORM_ORDERS.length)
  })

  it('never produces two orders with the same number on a day', () => {
    const p = plan()
    const keys = [
      ...OLD_PLATFORM_ORDERS.map((o) => `${o.order_date}#${o.daily_number}`),
      ...p.rows.orders.filter((o) => o.daily_number !== null).map((o) => `${o.order_date}#${o.daily_number}`),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('treats its own earlier import as already there, not as a collision', () => {
    const first = plan()
    const again = buildImportPlan(
      buildSnapshot(),
      buildPlatformState({
        existingOrders: [
          ...buildPlatformState().existingOrders,
          ...first.rows.orders.map((o) => ({ id: o.id, clientOrderId: o.client_order_id, orderDate: o.order_date, dailyNumber: o.daily_number, createdAt: o.created_at })),
        ],
      })
    )
    expect(again.rows.orders.map((o) => [o.id, o.daily_number])).toEqual(first.rows.orders.map((o) => [o.id, o.daily_number]))
    expect(again.summary.alreadyOnPlatform).toBe(5)
  })

  it('uses the store time zone for a missing order date', () => {
    expect(localDate(Date.parse('2026-08-01T17:00:00.000Z'), 'Asia/Manila')).toBe('2026-08-02')
    expect(localDate(Date.parse('2026-08-01T17:00:00.000Z'), null)).toBe('2026-08-02')
    expect(localDate(Date.parse('2026-08-01T17:00:00.000Z'), 'UTC')).toBe('2026-08-01')
  })
})

describe('buildImportPlan: the same register sale on both backends', () => {
  it('skips the Convex copy and points its claims at the platform order', () => {
    const p = plan()
    const twin = buildSnapshot().orders[4]
    expect(p.rows.orders.some((o) => o.customer_data.convex_order_id === twin._id)).toBe(false)
    expect(p.rows.idMap[twin._id]).toBe(OLD_PLATFORM_ORDERS[0].id)
    expect(p.rows.order_items.some((i) => i.order_id === uuidV5(twin._id))).toBe(false)
    expect(p.rows.order_payments.some((x) => x.order_id === uuidV5(twin._id))).toBe(false)
    expect(p.summary.skippedSameClientOrderId).toBe(1)
  })
})

describe('buildImportPlan: lines', () => {
  it('keeps legacy and grouped variations and turns addon objects into names + details', () => {
    const p = plan()
    const items = p.rows.order_items
    const latte = items.find((i) => i.menu_item_name === 'Latte' && i.variation === 'Large')!
    expect(latte.addons).toEqual(['Extra shot'])
    expect(latte.addon_details).toEqual([{ name: 'Extra shot', price: 25, quantity: 1 }])
    expect(latte.variation_selections).toBeNull()
    const fries = items.find((i) => i.special_instructions === 'no salt')!
    expect(fries.addons).toEqual(['Cheese dip'])
    expect(fries.addon_details).toEqual([{ name: 'Cheese dip', price: null, quantity: 1 }])
    const burger = items.find((i) => i.menu_item_name === 'Burger' && i.quantity === 2)!
    expect(burger.variation).toBeNull()
    expect(burger.variation_selections).toEqual([
      { typeName: 'Size', optionName: 'Double', priceAdjustment: 30 },
      { typeName: 'Spice', optionName: 'Hot', priceAdjustment: 0 },
    ])
    expect(burger.addon_details).toEqual([{ name: 'Bacon', price: 15, quantity: 2 }])
    expect(burger).toMatchObject({ is_bundle_item: true, bundle_id: null, bundle_name: 'Meal', slot_name: 'Main' })
  })

  it('nulls the link to a dish that no longer exists but keeps its name and price', () => {
    const p = plan()
    const retired = p.rows.order_items.find((i) => i.menu_item_name === 'Retired Special')!
    expect(retired.menu_item_id).toBeNull()
    expect(retired.price).toBe(200)
    expect(problem(p, 'menu_item_gone')?.count).toBe(1)
    expect(p.rows.order_items.find((i) => i.menu_item_id === MENU.latte)).toBeDefined()
  })

  it('reports a line without an order and does not import it', () => {
    const p = plan()
    expect(p.rows.order_items.some((i) => i.menu_item_name === 'Ghost')).toBe(false)
    expect(problem(p, 'orphan_item')?.count).toBe(1)
  })
})

describe('buildImportPlan: ledger and edits', () => {
  it('maps charges, refunds and methods; refunds keep their own method', () => {
    const p = plan()
    const edited = byConvexId(p, buildSnapshot().orders[1]._id)
    const ledger = p.rows.order_payments.filter((x) => x.order_id === edited.id)
    expect(ledger.map((x) => [x.kind, x.amount, x.payment_method_name, x.payment_method_id])).toEqual([
      ['charge', 200, 'Maya', null],
      ['refund', 20, 'Cash', CASH],
    ])
    expect(ledger[1].recorded_by).toBe(STAFF)
    expect(edited.amount_paid).toBe(180)
  })

  it('keeps a revision with its totals and numbers', () => {
    const [revision] = plan().rows.order_revisions
    expect(revision).toMatchObject({ revision_number: 1, total_before: 200, total_after: 180, reason: 'wrong price', revised_by: STAFF })
  })

  it('blocks when a refund comes before enough charge (the refund guard would refuse it)', () => {
    const snapshot = buildSnapshot()
    snapshot.orderPayments.push({ _id: 'k1pextra', _creationTime: snapshot.orders[2]._creationTime + 5, orderId: snapshot.orders[2]._id, kind: 'refund', amount: 5 })
    const p = buildImportPlan(snapshot, buildPlatformState())
    expect(problem(p, 'refund_exceeds_charges')?.severity).toBe('block')
    expect(hasBlockingProblem(p)).toBe(true)
  })

  it('drops ₱0 payment rows (the ledger CHECK refuses them)', () => {
    const snapshot = buildSnapshot()
    snapshot.orderPayments.push({ _id: 'k1pzero', _creationTime: snapshot.orders[0]._creationTime + 5, orderId: snapshot.orders[0]._id, kind: 'charge', amount: 0 })
    const p = buildImportPlan(snapshot, buildPlatformState())
    expect(problem(p, 'non_positive_payment')?.count).toBe(1)
    expect(p.summary.payments.charges.count).toBe(3)
  })
})

describe('buildImportPlan: product costs', () => {
  it('imports costs for live dishes, keeps an existing platform cost, drops deleted dishes', () => {
    const p = plan()
    expect(p.rows.product_costs.map((c) => [c.menu_item_id, c.cost_price])).toEqual([[MENU.latte, 42.25]])
    expect(p.summary.productCosts).toEqual({ toInsert: 1, alreadyOnPlatform: 1, droppedNoMenuItem: 1, expectedPresent: 2 })
  })
})

describe('buildImportPlan: refusals', () => {
  it('blocks a deployment that holds another store’s orders', () => {
    const snapshot = buildSnapshot()
    snapshot.orders[0].orderTypeId = FOREIGN_TYPE
    const p = buildImportPlan(snapshot, buildPlatformState())
    expect(problem(p, 'foreign_order_type')?.severity).toBe('block')
  })

  it('blocks a snapshot whose tenantConfig names another store', () => {
    const snapshot = buildSnapshot()
    snapshot.tenantConfig[0].value = OTHER_TENANT_ID
    expect(problem(buildImportPlan(snapshot, buildPlatformState()), 'tenant_config_mismatch')?.severity).toBe('block')
  })

  it('blocks a store with live loyalty (history would earn stamps)', () => {
    const state = buildPlatformState()
    state.tenant.loyaltyEnabled = true
    state.tenant.loyaltyShadow = false
    expect(problem(buildImportPlan(buildSnapshot(), state), 'loyalty_live')?.severity).toBe('block')
  })

  it('blocks an unknown status rather than guessing', () => {
    const snapshot = buildSnapshot()
    snapshot.orders[0].status = 'completed'
    expect(problem(buildImportPlan(snapshot, buildPlatformState()), 'bad_status')?.severity).toBe('block')
  })
})

describe('buildImportPlan: what stays behind and what gets rekeyed', () => {
  it('lists the tables that do not move, with counts', () => {
    expect(plan().summary.notMoved).toEqual([
      { table: 'analyticsEvents', rows: 12, why: expect.any(String) },
      { table: 'dailyOrderCounters', rows: 3, why: expect.any(String) },
      { table: 'productAnalytics', rows: 4, why: expect.any(String) },
      { table: 'pushTokens', rows: 2, why: expect.any(String) },
      { table: 'tenantConfig', rows: 1, why: expect.any(String) },
    ])
  })

  it('counts Convex-keyed stock rows, customer links and repeated activity rows', () => {
    const snapshot = buildSnapshot()
    const [o1, o2] = snapshot.orders
    const p = buildImportPlan(
      snapshot,
      buildPlatformState({
        convexKeyed: {
          order_stock_applications: [o1._id, o1._id],
          simple_option_stock_applications: [],
          simple_option_stock_movements: [],
          presell_stock_applications: [],
          stock_movements: [o1._id, o2._id, 'k1ounknown'],
        },
        customerLinkedConvexIds: [o2._id],
        activityPlacedConvexIds: [o1._id, o2._id],
      })
    )
    expect(p.summary.rekey.order_stock_applications).toBe(2)
    expect(p.summary.rekey.stock_movements).toBe(2)
    expect(problem(p, 'keyed_rows_without_order')?.count).toBe(1)
    expect(p.summary.customerLinks).toBe(1)
    expect(p.summary.activityPlacedDuplicates).toBe(2)
    expect(problem(p, 'activity_placed_twice')?.severity).toBe('warn')
  })

  it('never puts a customer field in a problem or the summary', () => {
    const p = plan()
    const text = JSON.stringify({ problems: p.problems, summary: p.summary })
    for (const order of buildSnapshot().orders) {
      if (order.customerName) expect(text).not.toContain(order.customerName)
      if (order.customerContact) expect(text).not.toContain(order.customerContact)
    }
  })
})
