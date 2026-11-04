import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  REPRINT_MARK,
  renderReceipt,
} from '@/lib/receipt-layout'

/**
 * Web mirror of webnegosyo-app/lib/receipt-reprint-mark.test.ts: the Studio
 * preview and the browser print render the same REPRINT mark the app prints,
 * and nothing at all without `reprint`.
 */

const order = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 10, 4, 4, 30),
  customerName: 'Walk-in',
  customerContact: 'n/a',
  total: 120,
  items: [{ menuItemName: 'Latte', quantity: 1, subtotal: 120 }],
}
const config = { storeName: 'Kape Co', width: 32 }

describe('REPRINT mark (web copy)', () => {
  it.each([
    ['classic', CLASSIC_RECEIPT_LAYOUT],
    ['modern', MODERN_RECEIPT_LAYOUT],
  ])('%s: under the order number, two lines, nothing else changed', (_name, layout) => {
    const first = renderReceipt(order, config, layout).split('\n')
    const again = renderReceipt({ ...order, reprint: { at: Date.UTC(2026, 10, 4, 9, 0) } }, config, layout).split('\n')
    const numberAt = again.findIndex((line) => line.includes('34567890'))
    expect(again[numberAt + 1]?.trim()).toBe(REPRINT_MARK)
    expect(again[numberAt + 2]).toMatch(/Reprinted /)
    expect(again.filter((line) => line.trim() !== REPRINT_MARK && !/Reprinted /.test(line))).toEqual(first)
  })

  it('prints no mark on a first print', () => {
    expect(renderReceipt(order, config, CLASSIC_RECEIPT_LAYOUT)).not.toContain('REPRINT')
  })
})
