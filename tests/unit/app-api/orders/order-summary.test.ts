import { appOrderDetailSchema, appOrderSummarySchema } from '@/lib/app-contract'
import { orderSummarySchema } from '@/lib/app-api/orders/order-index'
import { buildOrderSummary, placedOrderNumber, toAppOrderDetail, toAppOrderSummary } from '@/lib/app-api/orders/order-summary'
import { DISH, LARGE, SIZE_GROUP, SUMMARY, draft, placedResult, placedRow } from './order-fixtures'

jest.mock('server-only', () => ({}))

const SUMMARY_INPUT = {
  draftLines: draft().lines,
  orderKind: 'pickup' as const,
  orderTypeName: 'Pick Up',
  outletName: 'Katipunan',
  paymentMethodName: 'GCash',
}

describe('buildOrderSummary', () => {
  it('builds the snapshot from the engine lines and pricing, with the draft picks by index', () => {
    // Arrange
    const result = placedResult({
      pricing: { itemsSubtotal: 240, discountTotal: 24, serviceCharge: 10, deliveryFee: 50, total: 276 },
      lines: [{ menu_item_id: DISH, name: 'Iced Latte', quantity: 2, price: 130, subtotal: 260, variation: 'Large', addons: ['Extra shot ×2', ' '] }],
    })

    // Act
    const summary = buildOrderSummary({ ...SUMMARY_INPUT, lines: result.lines, pricing: result.pricing, order: result.order })

    // Assert
    expect(orderSummarySchema.parse(summary)).toEqual(summary)
    expect(summary.lines).toEqual([
      { itemId: DISH, name: 'Iced Latte', quantity: 2, options: ['Large', 'Extra shot ×2'], lineTotal: 260, selections: { [SIZE_GROUP]: { [LARGE]: 1 } } },
    ])
    expect(summary.totals).toEqual({ subtotal: 240, discount: 24, serviceCharge: 10, deliveryFee: 50, total: 276 })
    expect(summary).toMatchObject({ orderKind: 'pickup', orderTypeName: 'Pick Up', outletName: 'Katipunan', number: '07', paymentMethodName: 'GCash' })
  })

  it('drops picks instead of misattributing them when the line counts disagree', () => {
    const result = placedResult()
    const summary = buildOrderSummary({ ...SUMMARY_INPUT, draftLines: [...draft().lines, ...draft().lines], lines: result.lines, pricing: result.pricing, order: result.order })
    expect(summary.lines[0].selections).toEqual({})
  })

  it('has no number for a Convex order (the backend returns only an id)', () => {
    const result = placedResult({ order: { id: 'k17abc' } as never })
    expect(buildOrderSummary({ ...SUMMARY_INPUT, lines: result.lines, pricing: result.pricing, order: result.order }).number).toBeNull()
  })
})

describe('placedOrderNumber', () => {
  it('reads every backend spelling of the daily number', () => {
    expect(placedOrderNumber({ daily_number: 3 })).toBe('03')
    expect(placedOrderNumber({ daily_order_number: 12 })).toBe('12')
    expect(placedOrderNumber({ dailyNumber: 9 })).toBe('09')
    expect(placedOrderNumber(null)).toBeNull()
  })
})

describe('toAppOrderDetail / toAppOrderSummary', () => {
  it('answers from the snapshot when there is no live read', () => {
    const detail = toAppOrderDetail(placedRow({ lastStatus: 'preparing' }), null)
    expect(appOrderDetailSchema.parse(detail)).toEqual(detail)
    expect(detail).toMatchObject({ id: 'order-1', status: 'preparing', paymentStatus: 'unknown', estimatedReadyAt: null, number: '07' })
    expect(detail.placedAt).toBe('2026-11-04T10:00:00.123Z')
    expect(detail.lines[0]).toEqual({ id: 'line-0', itemId: DISH, selections: SUMMARY.lines[0].selections, name: 'Iced Latte', quantity: 2, options: ['Large'], lineTotal: 240 })
  })

  it('takes status, payment, ready time and number from the live read', () => {
    const live = { status: 'ready' as const, paymentStatus: 'paid' as const, estimatedReadyAt: '2026-11-04T10:20:00.000Z', number: '08' }
    expect(toAppOrderDetail(placedRow(), live)).toMatchObject(live)
  })

  it('falls back to pending when the row has never been read', () => {
    expect(toAppOrderDetail(placedRow({ lastStatus: null }), null).status).toBe('pending')
  })

  it('previews at most five lines as "2× Name"', () => {
    const lines = Array.from({ length: 7 }, (_, index) => ({ ...SUMMARY.lines[0], name: `Dish ${index}` }))
    const summary = toAppOrderSummary(placedRow({ summary: { ...SUMMARY, lines } }), null)
    expect(appOrderSummarySchema.parse(summary)).toEqual(summary)
    expect(summary.itemsPreview).toEqual(['2× Dish 0', '2× Dish 1', '2× Dish 2', '2× Dish 3', '2× Dish 4'])
    expect(summary.total).toBe(240)
  })
})
