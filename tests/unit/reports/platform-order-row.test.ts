/**
 * Platform `orders` / `order_items` / `order_payments` rows → the
 * storage-neutral report order. Pure; the reader that fetches them is Phase 1.
 */
import { toReportOrder } from '@/lib/reports/read/platform-order-row'

const ROW = {
  id: 'o1',
  created_at: '2026-10-12T13:48:12.409+00:00',
  status: 'delivered',
  payment_status: 'paid',
  source: 'pos',
  order_type: 'dine_in',
  outlet_id: null,
  total: '131.89',
  service_charge_amount: '7.95',
  delivery_fee: null,
  discount_data: null,
  customer_data: {
    table_number: 'T5',
    discount: { total: 35.06, deliveryDiscount: 0, lines: [{ label: 'Discount — Employee', amount: 35.06 }], allocationsByLine: {} },
    pos: { cash: 200 },
  },
  payment_method_id: null,
  payment_method_name: 'Cash',
}

describe('toReportOrder', () => {
  test('maps the order, reading the discount the way every receipt does', () => {
    const order = toReportOrder(
      ROW,
      [{ id: 'i1', order_id: 'o1', menu_item_id: 'd1', menu_item_name: 'Latte', category_name: 'Coffee', quantity: 1, subtotal: '159.00' }],
      [{ order_id: 'o1', kind: 'charge', amount: '131.89', payment_method_id: 'm1', payment_method_name: 'Cash', created_at: '2026-10-12T13:49:00Z' }],
    )
    expect(order).toMatchObject({
      id: 'o1',
      at: Date.parse('2026-10-12T13:48:12.409Z'),
      channel: 'counter',
      orderType: 'Dine In',
      hasTable: true,
      total: '131.89',
      serviceCharge: '7.95',
      methodName: 'Cash',
      lines: [{ id: 'i1', menuItemId: 'd1', name: 'Latte', categoryName: 'Coffee', quantity: 1, subtotal: '159.00' }],
      payments: [{ kind: 'charge', amount: '131.89', methodId: 'm1', methodName: 'Cash', at: Date.parse('2026-10-12T13:49:00Z') }],
    })
    expect(order.discount?.total).toBe(35.06)
  })

  test('a blank or spaces-only table is not a table', () => {
    expect(toReportOrder({ ...ROW, customer_data: { table_number: '  ' } }, [], []).hasTable).toBe(false)
    expect(toReportOrder({ ...ROW, customer_data: null }, [], []).hasTable).toBe(false)
  })

  test('an unparseable date is refused rather than placed at 1970', () => {
    expect(() => toReportOrder({ ...ROW, created_at: 'nope' }, [], [])).toThrow(/o1/)
  })
})
