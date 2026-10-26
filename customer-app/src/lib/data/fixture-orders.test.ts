import { VALID_CATALOG, VALID_ORDER_DRAFT } from '@/fixtures/contract-fixtures'
import { appCatalogSchema, appOrderDetailSchema, appOrderDraftSchema } from '@/lib/contract'
import { priceDraft, prototypeStatusAt } from './fixture-orders'

const catalog = appCatalogSchema.parse(VALID_CATALOG)
const draft = appOrderDraftSchema.parse(VALID_ORDER_DRAFT)
const context = { id: 'order-9', number: '08', placedAt: '2026-09-30T02:10:00Z' }

describe('priceDraft (prototype server)', () => {
  it('reprices from the menu and returns a contract-valid order', () => {
    const order = priceDraft(draft, catalog, context)
    expect(appOrderDetailSchema.safeParse(order).success).toBe(true)
    // Latte 145 + Grande 20 + Oat 30 = 195, ×2.
    expect(order.totals).toEqual({ subtotal: 390, discount: 0, serviceCharge: 0, deliveryFee: 0, total: 390 })
    expect(order.lines[0].options).toEqual(['Grande 16oz', 'Oat milk'])
    expect(order.paymentStatus).toBe('pending')
  })

  it('applies a reward then a voucher, and charges delivery', () => {
    const order = priceDraft(
      { ...draft, orderTypeId: 'ot-delivery', rewardId: 'ent-1', voucherCode: 'kape10', paymentMethodId: 'pm-online' },
      catalog,
      context,
    )
    // 390 − 195 (free latte) = 195 → below KAPE10's ₱200 minimum, so only the reward applies.
    expect(order.totals).toMatchObject({ subtotal: 390, discount: 195, deliveryFee: 49, total: 244 })
    expect(order.paymentStatus).toBe('paid')
  })

  it('refuses a sold-out dish', () => {
    const soldOut = { ...draft, lines: [{ itemId: 'item-nitro', quantity: 1, selections: {} }] }
    expect(() => priceDraft(soldOut, catalog, context)).toThrow('sold out')
  })
})

describe('prototypeStatusAt', () => {
  it('walks the order through the kitchen', () => {
    expect(prototypeStatusAt(0)).toBe('pending')
    expect(prototypeStatusAt(7_000)).toBe('confirmed')
    expect(prototypeStatusAt(20_000)).toBe('preparing')
    expect(prototypeStatusAt(60_000)).toBe('delivered')
  })
})
