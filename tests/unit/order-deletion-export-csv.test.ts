/**
 * The file an owner must download before anything is deleted.
 *
 * It is the only copy they keep once the recovery window closes, so every
 * order must be in it with its lines, and nothing a customer typed may run as a
 * spreadsheet formula when the owner opens it.
 */
import { buildOrderExportCsv, exportFileName } from '@/lib/order-deletion/export-csv'
import type { ExportItem, ExportOrder } from '@/lib/order-deletion/types'

const order = (overrides: Partial<ExportOrder> = {}): ExportOrder => ({
  id: 'order-1',
  created_at: '2026-09-01T02:30:00.000Z',
  updated_at: '2026-09-01T03:00:00.000Z',
  daily_number: 7,
  status: 'delivered',
  payment_status: 'paid',
  payment_method_name: 'GCash',
  order_type: 'Delivery',
  outlet_id: null,
  customer_name: 'Juan Dela Cruz',
  customer_contact: '09171234567',
  delivery_fee: 50,
  service_charge_amount: 0,
  discount_total: 0,
  total: 350,
  amount_paid: 350,
  source: 'web',
  ...overrides,
})

const item = (overrides: Partial<ExportItem> = {}): ExportItem => ({
  order_id: 'order-1',
  menu_item_name: 'Chicken Adobo',
  variation: 'Large',
  addons: ['Extra rice'],
  quantity: 2,
  price: 150,
  subtotal: 300,
  special_instructions: null,
  ...overrides,
})

function rowsOf(csv: string): string[] {
  return csv.replace(/^﻿/, '').split('\r\n')
}

describe('buildOrderExportCsv', () => {
  test('writes a header and one row per order, in Manila time', () => {
    const csv = buildOrderExportCsv([order()], [item()], new Map())
    const [header, row] = rowsOf(csv)

    expect(header).toContain('Order #')
    expect(header).toContain('Items')
    expect(row).toContain('2026-09-01 10:30')
    expect(row).toContain('Juan Dela Cruz')
    expect(row).toContain('2× Chicken Adobo (Large) + Extra rice')
    expect(row).toContain('order-1')
  })

  test('starts with a byte-order mark so Excel reads peso signs and accents', () => {
    expect(buildOrderExportCsv([order()], [], new Map()).startsWith('﻿')).toBe(true)
  })

  test('joins several lines of one order and leaves an order with none blank', () => {
    const csv = buildOrderExportCsv(
      [order(), order({ id: 'order-2', daily_number: 8 })],
      [item(), item({ menu_item_name: 'Iced Tea', variation: null, addons: null, quantity: 1 })],
      new Map()
    )
    const rows = rowsOf(csv)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('2× Chicken Adobo (Large) + Extra rice; 1× Iced Tea')
    expect(rows[2]).toContain('order-2')
  })

  test('names the branch when the order has one', () => {
    const csv = buildOrderExportCsv(
      [order({ outlet_id: 'outlet-1' })],
      [],
      new Map([['outlet-1', 'Makati']])
    )
    expect(rowsOf(csv)[1]).toContain('Makati')
  })

  test('defuses a customer name that is a spreadsheet formula', () => {
    const csv = buildOrderExportCsv(
      [order({ customer_name: '=HYPERLINK("http://evil.example","click")' })],
      [],
      new Map()
    )
    expect(csv).not.toMatch(/,=HYPERLINK/)
    expect(csv).toContain(`'=HYPERLINK`)
  })
})

describe('exportFileName', () => {
  test('names the store and the day it was taken', () => {
    expect(exportFileName('aling-nena', new Date('2026-09-24T01:00:00.000Z'))).toBe(
      'aling-nena-orders-backup-2026-09-24.csv'
    )
  })

  test('keeps only safe characters from the slug', () => {
    expect(exportFileName('../../etc', new Date('2026-09-24T01:00:00.000Z'))).toBe(
      'etc-orders-backup-2026-09-24.csv'
    )
  })
})
