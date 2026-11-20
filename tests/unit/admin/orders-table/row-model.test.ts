import { describe, expect, it } from '@jest/globals'
import {
  convexOrderRow,
  itemsSummary,
  orderKindOf,
  paymentChipOf,
  platformOrderRow,
} from '@/lib/admin/orders-table/row-model'
import { nextStatusStep, ORDER_STATUSES, STATUS_META, toOrderStatus } from '@/lib/admin/orders-table/status'
import type { OrderWithItems } from '@/lib/orders-service'

const platformOrder = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    daily_number: 7,
    order_type: 'Padala',
    order_type_id: 'type-1',
    status: 'pending',
    customer_name: '  ',
    customer_contact: '0917 000 0000',
    customer_data: { table_number: 't4' },
    payment_status: 'pending',
    payment_method_name: 'GCash',
    total: 540,
    created_at: '2026-11-21T04:41:00.000Z',
    order_items: [
      { id: '1', menu_item_name: 'Burger', quantity: 2, price: 150, subtotal: 300, variation: null, addons: [], special_instructions: null },
      { id: '2', menu_item_name: 'Fries', quantity: 1, price: 90, subtotal: 90, variation: null, addons: [], special_instructions: null },
      { id: '3', menu_item_name: 'Iced tea', quantity: 1, price: 60, subtotal: 60, variation: null, addons: [], special_instructions: null },
    ],
    ...overrides,
  }) as unknown as OrderWithItems

describe('status flow', () => {
  it('names every status and moves each open one forward exactly once', () => {
    for (const status of ORDER_STATUSES) expect(STATUS_META[status].label).toBeTruthy()
    expect(nextStatusStep('pending')).toEqual({ status: 'confirmed', label: 'Confirm' })
    expect(nextStatusStep('confirmed')?.status).toBe('preparing')
    expect(nextStatusStep('preparing')?.status).toBe('ready')
    expect(nextStatusStep('ready')).toEqual({ status: 'delivered', label: 'Complete' })
  })

  it('offers no step on a finished order', () => {
    expect(nextStatusStep('delivered')).toBeNull()
    expect(nextStatusStep('cancelled')).toBeNull()
  })

  it('reads an unknown stored status as a new order', () => {
    expect(toOrderStatus('shipped')).toBe('pending')
  })
})

describe('paymentChipOf', () => {
  const chip = (status: Parameters<typeof paymentChipOf>[0]['status'], paymentStatus: string | null, hasProof = false) =>
    paymentChipOf({ status, paymentStatus, hasProof })

  it('says paid for paid and verified, whatever the status', () => {
    expect(chip('pending', 'paid')).toBe('paid')
    expect(chip('delivered', 'verified')).toBe('paid')
  })

  it('asks the merchant to check a proof nobody has marked paid', () => {
    expect(chip('confirmed', 'pending', true)).toBe('proof')
    expect(chip('delivered', 'pending', true)).toBe('proof')
  })

  it('says not paid only while the order is still open', () => {
    expect(chip('ready', 'pending')).toBe('unpaid')
    expect(chip('preparing', 'failed')).toBe('failed')
    expect(chip('delivered', 'pending')).toBe('none')
  })

  it('says nothing for a cancelled order or a backend with no payment status', () => {
    expect(chip('cancelled', 'paid')).toBe('none')
    expect(chip('pending', null)).toBe('none')
  })
})

describe('orderKindOf', () => {
  it("trusts the store's own type over the label", () => {
    expect(orderKindOf('Padala', 'delivery')).toBe('delivery')
    expect(orderKindOf('Grab', 'grab')).toBe('other')
  })

  it('guesses from the label when the type row is unknown', () => {
    expect(orderKindOf('Dine In')).toBe('dine_in')
    expect(orderKindOf('dine_in')).toBe('dine_in')
    expect(orderKindOf('Pick-up')).toBe('pickup')
    expect(orderKindOf('Take out')).toBe('pickup')
    expect(orderKindOf('Delivery')).toBe('delivery')
    expect(orderKindOf(null)).toBeNull()
  })
})

describe('itemsSummary', () => {
  it('shows quantities above one and counts what did not fit', () => {
    expect(itemsSummary([
      { menu_item_name: 'Burger', quantity: 2 },
      { menu_item_name: 'Fries', quantity: 1 },
      { menu_item_name: 'Tea', quantity: 1 },
    ])).toEqual({ text: '2× Burger, Fries', more: 1 })
    expect(itemsSummary([])).toEqual({ text: '', more: 0 })
  })
})

describe('platformOrderRow', () => {
  it('maps a platform order onto the table row', () => {
    const row = platformOrderRow(platformOrder(), { typeKinds: { 'type-1': 'delivery' } })
    expect(row).toMatchObject({
      numberLabel: '#07',
      status: 'pending',
      customerName: 'Guest',
      customerContact: '0917 000 0000',
      typeLabel: 'Padala',
      kind: 'delivery',
      tableNumber: 'T4',
      itemsText: '2× Burger, Fries',
      moreItems: 1,
      itemCount: 4,
      total: 540,
      discountTotal: 0,
      payment: 'unpaid',
      paymentMethod: 'GCash',
      createdAtMs: Date.parse('2026-11-21T04:41:00.000Z'),
    })
  })

  it('names the branch from the store list when the order kept no snapshot', () => {
    const row = platformOrderRow(platformOrder({ outlet_id: 'outlet-1', customer_data: {} }), {
      outletNames: { 'outlet-1': 'Lucena' },
    })
    expect(row.outletLabel).toBe('Lucena')
  })

  it('reads a payment proof as one to check', () => {
    const row = platformOrderRow(platformOrder({ payment_proof_uploaded_at: '2026-11-21T04:42:00.000Z' }))
    expect(row.payment).toBe('proof')
  })

  it('shows what a discount took off', () => {
    const row = platformOrderRow(
      platformOrder({ discount_data: { total: 40, deliveryDiscount: 0, lines: [{ label: 'WELCOME', amount: 40 }], allocationsByLine: {} } } as never),
    )
    expect(row.discountTotal).toBe(40)
  })
})

describe('convexOrderRow', () => {
  it('maps a Convex document onto the same row', () => {
    const row = convexOrderRow({
      _id: 'k17abc',
      _creationTime: 1_700_000_000_000,
      dailyNumber: 12,
      customerName: 'Ben',
      customerContact: '',
      orderType: 'Dine In',
      status: 'ready',
      total: 297,
      itemCount: 3,
      paymentStatus: 'paid',
      source: 'pos',
      customerData: { table_number: '5', outlet_name: 'Main' },
    })
    expect(row).toMatchObject({
      id: 'k17abc',
      numberLabel: '#12',
      customerName: 'Ben',
      customerContact: null,
      kind: 'dine_in',
      tableNumber: '5',
      outletLabel: 'Main',
      itemsText: '',
      itemCount: 3,
      payment: 'paid',
      source: 'pos',
      status: 'ready',
    })
  })
})
