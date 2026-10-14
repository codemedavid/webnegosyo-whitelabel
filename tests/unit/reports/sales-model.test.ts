/**
 * The one definition of the sales numbers (plan §5). Every report screen, the
 * export and the merchant app read these figures; nothing else defines "net
 * sales".
 */
import {
  growthRatio,
  orderFigures,
  orderLineFigures,
  rollupLines,
  rollupOrders,
  summarizeSales,
} from '@/lib/reports/sales-model'
import { line, order, payment } from './report-fixtures'

const DISCOUNT_35 = { total: 35.06, deliveryDiscount: 0, lines: [{ label: 'Discount — Employee', amount: 35.06 }], allocationsByLine: {} }

describe('orderFigures', () => {
  test('a live POS sale with a discount and a service charge (live order 511c5928)', () => {
    const figures = orderFigures(
      order({
        total: '131.89',
        serviceCharge: '7.95',
        paymentStatus: 'paid',
        discount: DISCOUNT_35,
        lines: [line({ subtotal: '159.00' })],
      }),
    )
    expect(figures).toMatchObject({
      isLive: true,
      isSettled: true,
      grossCents: 15900,
      discountCents: 3506,
      netCents: 12394,
      serviceCents: 795,
      deliveryCents: 0,
      billedCents: 13189,
      collectedCents: 13189,
      unpaidCents: 0,
      lineGapCents: 0,
    })
    expect(figures.discountByKind.manual).toBe(3506)
  })

  test('the order total is the authority: gross is derived from it and a disagreeing line sum is reported', () => {
    // Live order 40e1485c: edited, lines 1,015 + service 50.75, yet billed 1,015.
    const figures = orderFigures(order({ total: '1015.00', serviceCharge: '50.75', lines: [line({ subtotal: '1015.00' })] }))
    expect(figures.billedCents).toBe(101500)
    expect(figures.grossCents).toBe(96425)
    expect(figures.lineGapCents).toBe(5075)
  })

  test('delivery is a fee, never a sale; a delivery discount lowers the fee, not the food', () => {
    const figures = orderFigures(
      order({
        total: 230,
        deliveryFee: 49,
        discount: { total: 49, deliveryDiscount: 49, lines: [{ label: 'Free delivery', amount: 49 }], allocationsByLine: {} },
        lines: [line({ subtotal: 230 })],
      }),
    )
    expect(figures).toMatchObject({ grossCents: 23000, discountCents: 0, deliveryDiscountCents: 4900, deliveryCents: 0, netCents: 23000 })
  })

  test('cancelled, refunded and voided orders are not sales', () => {
    for (const status of ['cancelled', 'Canceled', 'refunded', 'voided']) {
      expect(orderFigures(order({ status })).isLive).toBe(false)
    }
    expect(orderFigures(order({ total: -5 })).isLive).toBe(false)
  })

  describe('collected and unpaid (paid = ledger, or status, or handover)', () => {
    test('nothing recorded: owing in full', () => {
      expect(orderFigures(order())).toMatchObject({ isSettled: false, collectedCents: 0, unpaidCents: 10000 })
    })

    test('paid or verified status with no ledger: collected in full', () => {
      expect(orderFigures(order({ paymentStatus: 'verified' }))).toMatchObject({ collectedCents: 10000, unpaidCents: 0 })
    })

    test('handed over (delivered, no table) is settled; a table served is still owing', () => {
      expect(orderFigures(order({ status: 'delivered' })).unpaidCents).toBe(0)
      expect(orderFigures(order({ status: 'delivered', hasTable: true })).unpaidCents).toBe(10000)
    })

    test('no payment status at all is a backend with nothing to say, not a debt (app isOrderUnpaid)', () => {
      expect(orderFigures(order({ paymentStatus: null }))).toMatchObject({ isSettled: true, unpaidCents: 0, collectedCents: 10000 })
    })

    test('a part payment leaves the rest unpaid', () => {
      const figures = orderFigures(order({ payments: [payment({ amount: 40 })] }))
      expect(figures).toMatchObject({ collectedCents: 4000, unpaidCents: 6000, overpaidCents: 0 })
    })

    test('a settled status covers a short ledger', () => {
      const figures = orderFigures(order({ paymentStatus: 'paid', payments: [payment({ amount: 40 })] }))
      expect(figures).toMatchObject({ collectedCents: 10000, unpaidCents: 0 })
    })

    test('taking more than the bill is overpaid (a refund is due), never extra sales', () => {
      const figures = orderFigures(order({ payments: [payment({ amount: 120 })] }))
      expect(figures).toMatchObject({ netCents: 10000, collectedCents: 12000, overpaidCents: 2000, unpaidCents: 0 })
    })

    test('a refund is change handed back after an edit lowered the bill, not a second cut to sales', () => {
      // Paid 100, the order was edited down to 80, 20 went back.
      const figures = orderFigures(
        order({ total: 80, lines: [line({ subtotal: 80 })], payments: [payment({ amount: 100 }), payment({ kind: 'refund', amount: 20 })] }),
      )
      expect(figures).toMatchObject({ refundCents: 2000, netCents: 8000, collectedCents: 8000, unpaidCents: 0, overpaidCents: 0, billedCents: 8000 })
    })
  })
})

describe('orderLineFigures', () => {
  test('the discount is shared across lines by their value, and lines add up to the order exactly', () => {
    const lines = orderLineFigures(
      order({
        total: 100,
        discount: { total: 10, deliveryDiscount: 0, lines: [], allocationsByLine: {} },
        lines: [line({ id: 'a', subtotal: 36.67 }), line({ id: 'b', subtotal: 36.67 }), line({ id: 'c', subtotal: 36.66 })],
      }),
    )
    expect(lines.map((l) => l.discountCents)).toEqual([334, 333, 333])
    expect(lines.reduce((sum, l) => sum + l.netCents, 0)).toBe(10000)
  })

  test('lines that disagree with the bill are scaled to it', () => {
    const lines = orderLineFigures(
      order({ total: 50, lines: [line({ id: 'a', subtotal: 60 }), line({ id: 'b', subtotal: 40 })] }),
    )
    expect(lines.map((l) => l.netCents)).toEqual([3000, 2000])
  })

  test('an order whose lines were not recorded is one "not recorded" line, so nothing goes missing', () => {
    const lines = orderLineFigures(order({ lines: [] }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ lineId: null, menuItemId: null, isUnrecorded: true, netCents: 10000 })
  })

  test('a cancelled order has no sales lines', () => {
    expect(orderLineFigures(order({ status: 'cancelled' }))).toEqual([])
  })
})

describe('summarizeSales', () => {
  const orders = [
    order({ id: 'a', total: '131.89', serviceCharge: '7.95', paymentStatus: 'paid', discount: DISCOUNT_35, lines: [line({ subtotal: 159 })] }),
    order({ id: 'b', total: 200, deliveryFee: 50, lines: [line({ subtotal: 150 })] }),
    order({ id: 'c', status: 'cancelled', total: 75 }),
  ]

  test('totals, voids and the average order', () => {
    const summary = summarizeSales(orders)
    expect(summary).toMatchObject({
      orders: 2,
      grossCents: 30900,
      discountCents: 3506,
      netCents: 27394,
      serviceCents: 795,
      deliveryCents: 5000,
      billedCents: 33189,
      collectedCents: 13189,
      unpaidCents: 20000,
      aovCents: 13697,
      voids: { orders: 1, billedCents: 7500 },
    })
  })

  test('no orders: an average of null, not zero', () => {
    expect(summarizeSales([]).aovCents).toBeNull()
  })

  test('the average never prints as -0.00', () => {
    // Net −₱0.01 over three orders: Math.round(−1/3) is −0.
    const orders = [
      order({ id: 'a', total: 0, lines: [] , discount: { total: 0.01, deliveryDiscount: 0, lines: [], allocationsByLine: {} } }),
      order({ id: 'b', total: 0, lines: [] }),
      order({ id: 'c', total: 0, lines: [] }),
    ]
    expect(Object.is(summarizeSales(orders).aovCents, 0)).toBe(true)
  })

  test('a ledger row with no kind is a charge, never a crash', () => {
    const orders = [order({ payments: [payment({ kind: undefined as unknown as string })] })]
    expect(summarizeSales(orders).collectedCents).toBe(10000)
  })

  test('orders whose lines disagree with their total are disclosed', () => {
    const summary = summarizeSales([order({ total: 50, lines: [line({ subtotal: 60 })] }), order({ lines: [] })])
    expect(summary.coverage).toEqual({ ordersWithoutLines: 1, ordersLinesMismatch: 1, lineGapCents: 1000 })
  })
})

describe('rollups', () => {
  const orders = [
    order({ id: 'a', channel: 'counter', outletId: 'north', lines: [line({ id: 'a1', menuItemId: 'x', categoryName: 'Mains' })] }),
    order({
      id: 'b',
      channel: 'online',
      outletId: null,
      total: 300,
      lines: [line({ id: 'b1', menuItemId: 'x', categoryName: 'Mains', quantity: 2, subtotal: 200 }), line({ id: 'b2', menuItemId: 'y', categoryName: null })],
    }),
  ]

  test('by item and by category both add up to net sales', () => {
    const net = summarizeSales(orders).netCents
    const byItem = rollupLines(orders, (l) => l.menuItemId ?? 'none')
    const byCategory = rollupLines(orders, (l) => l.categoryName ?? 'Uncategorised')
    expect(byItem.get('x')).toMatchObject({ quantity: 3, netCents: 30000, orders: 2 })
    expect([...byItem.values()].reduce((s, r) => s + r.netCents, 0)).toBe(net)
    expect([...byCategory.values()].reduce((s, r) => s + r.netCents, 0)).toBe(net)
    expect(byCategory.get('Uncategorised')?.netCents).toBe(10000)
  })

  test('by channel and by branch both add up to net sales, unassigned included', () => {
    const byChannel = rollupOrders(orders, (o) => o.channel)
    const byBranch = rollupOrders(orders, (o) => o.outletId ?? 'unassigned')
    expect(byChannel.get('online')?.netCents).toBe(30000)
    expect(byBranch.get('unassigned')).toMatchObject({ orders: 1, netCents: 30000 })
    expect(byBranch.get('north')).toMatchObject({ orders: 1, netCents: 10000 })
  })
})

describe('growthRatio', () => {
  test('null ("new") when there is nothing to compare with, never 0%', () => {
    expect(growthRatio(500, 0)).toBeNull()
    expect(growthRatio(0, 0)).toBeNull()
    expect(growthRatio(150, 100)).toBe(0.5)
    expect(growthRatio(0, 100)).toBe(-1)
  })
})
