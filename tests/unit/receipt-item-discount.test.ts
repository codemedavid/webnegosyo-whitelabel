/**
 * A discount that came off particular dishes (a voucher limited to N items,
 * a cashier's discount on one item) names the dish under its row on every
 * receipt — and the receipt still adds up.
 */
import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  renderReceipt,
} from '@/lib/receipt-layout'
import { stripReceiptMarkup } from '@/lib/receipt-layout'

const order = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 9, 15, 4, 30),
  customerName: 'Walk-in',
  customerContact: 'n/a',
  total: 634,
  items: [
    { menuItemName: 'Fries', quantity: 5, subtotal: 560 },
    { menuItemName: 'Burger', quantity: 1, subtotal: 150 },
  ],
  customerData: {
    discount: {
      total: 76,
      deliveryDiscount: 0,
      lines: [
        { label: 'Fries 50%', amount: 56, code: 'FRIES50', items: [{ lineKey: 'line-0', units: 1, amount: 56 }] },
        { label: 'Discount — Cold', amount: 20, items: [{ lineKey: 'line-1', units: 1, amount: 20 }] },
      ],
      allocationsByLine: { 'line-0': 56, 'line-1': 20 },
    },
  },
}

const config = { storeName: 'Kape Co', width: 32 }

describe.each([
  ['classic', CLASSIC_RECEIPT_LAYOUT],
  ['modern', MODERN_RECEIPT_LAYOUT],
  ['compact', COMPACT_RECEIPT_LAYOUT],
  ['detailed', DETAILED_RECEIPT_LAYOUT],
])('%s receipt', (_, layout) => {
  const lines = stripReceiptMarkup(renderReceipt(order, config, layout)).split('\n')

  it('prints each item discount with the dish and units under it', () => {
    const fries = lines.findIndex((line) => line.includes('Fries 50%'))
    expect(lines[fries]).toContain('-P56.00')
    expect(lines[fries + 1].trim()).toBe('Fries x1')

    const cold = lines.findIndex((line) => line.includes('Discount — Cold'))
    expect(lines[cold]).toContain('-P20.00')
    expect(lines[cold + 1].trim()).toBe('Burger x1')
  })

  it('still totals the bill and keeps every line on the paper', () => {
    expect(lines.some((line) => /TOTAL/.test(line) && line.includes('P634.00'))).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32)
  })
})

it('prints an order-wide discount exactly as before (no dish line)', () => {
  const plain = {
    ...order,
    total: 690,
    customerData: { discount: { total: 20, lines: [{ label: 'WELCOME', amount: 20 }] } },
  }
  const lines = stripReceiptMarkup(renderReceipt(plain, config, CLASSIC_RECEIPT_LAYOUT)).split('\n')
  const at = lines.findIndex((line) => line.includes('WELCOME'))
  expect(lines[at + 1].startsWith('  ')).toBe(false)
})
