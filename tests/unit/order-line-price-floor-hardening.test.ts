import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderLinePrice,
  type OrderLinePriceInput,
  type StoreMenuItemPricing,
} from '@/lib/order-line-price-floor'

/**
 * The floor used to be `line.price < floor ? floor : line.price`. Every
 * comparison with NaN is false, so a NaN (or a string, or undefined) walked
 * straight past it, and `Math.abs(x - NaN) > eps` was false too — so the
 * client's own subtotal was kept. A browser could post `price: NaN,
 * subtotal: 0` and check out for nothing.
 */

const line = (over: Partial<OrderLinePriceInput> = {}): OrderLinePriceInput => ({
  menu_item_id: 'item-1',
  menu_item_name: 'Adobo',
  price: 180,
  quantity: 2,
  subtotal: 360,
  ...over,
})

const storeItem: StoreMenuItemPricing = {
  id: 'item-1',
  price: 180,
  discounted_price: null,
  is_available: true,
}

describe('resolveOrderLinePrice — non-finite and negative prices', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '1' as unknown as number],
    ['undefined', undefined as unknown as number],
    ['null', null as unknown as number],
    ['a negative number', -50],
  ])('refuses a line whose price is %s', (_label, price) => {
    const result = resolveOrderLinePrice(line({ price }), storeItem, null)

    expect(result.ok).toBe(false)
  })
})

describe('resolveOrderLinePrice — the subtotal is always the server’s', () => {
  it('ignores a client subtotal that agrees to within rounding', () => {
    const result = resolveOrderLinePrice(line({ subtotal: 360.01 }), storeItem, null)

    expect(result).toEqual({ ok: true, price: 180, subtotal: 360 })
  })

  it('ignores a NaN client subtotal', () => {
    const result = resolveOrderLinePrice(line({ subtotal: Number.NaN }), storeItem, null)

    expect(result).toEqual({ ok: true, price: 180, subtotal: 360 })
  })

  it('ignores a zero client subtotal', () => {
    const result = resolveOrderLinePrice(line({ subtotal: 0 }), storeItem, null)

    expect(result).toEqual({ ok: true, price: 180, subtotal: 360 })
  })
})

describe('resolveOrderLinePrice — the modifier floor', () => {
  it('raises the floor by the verified option and add-on total', () => {
    const result = resolveOrderLinePrice(line({ price: 180, subtotal: 360 }), storeItem, null, 45)

    expect(result).toEqual({ ok: true, price: 225, subtotal: 450 })
  })

  it('keeps a client price that already covers the modifiers', () => {
    const result = resolveOrderLinePrice(line({ price: 225, subtotal: 450 }), storeItem, null, 45)

    expect(result).toEqual({ ok: true, price: 225, subtotal: 450 })
  })

  it('lowers the floor for a verified negative option (e.g. "No rice −10")', () => {
    const result = resolveOrderLinePrice(line({ price: 170, subtotal: 340 }), storeItem, null, -10)

    expect(result).toEqual({ ok: true, price: 170, subtotal: 340 })
  })

  it('never lets negative modifiers take the floor below zero', () => {
    const result = resolveOrderLinePrice(line({ price: 0, subtotal: 0 }), storeItem, null, -500)

    expect(result).toEqual({ ok: true, price: 0, subtotal: 0 })
  })

  it('refuses a non-finite modifier total rather than pricing with it', () => {
    const result = resolveOrderLinePrice(line(), storeItem, null, Number.NaN)

    expect(result.ok).toBe(false)
  })
})

/**
 * The float slack used to be a whole centavo (`price < floor - 0.01`), so a
 * claim one centavo under the floor was kept: the customer app (which sends
 * every line at 0) got a ₱0.01 dish free, and a forged web claim shaved a
 * centavo per unit. Prices are compared in whole centavos instead.
 */
describe('resolveOrderLinePrice — no centavo of slack below the floor', () => {
  it('raises a claim one centavo under the floor', () => {
    const result = resolveOrderLinePrice(line({ price: 179.99, quantity: 1 }), storeItem, null)

    expect(result).toEqual({ ok: true, price: 180, subtotal: 180 })
  })

  it('charges a ₱0.01 dish sent at price 0', () => {
    const result = resolveOrderLinePrice(line({ price: 0, quantity: 3 }), { ...storeItem, price: 0.01 }, null)

    expect(result).toEqual({ ok: true, price: 0.01, subtotal: 0.03 })
  })

  it('still reads float noise at the floor as the floor', () => {
    const noisy = 0.1 + 0.2 // 0.30000000000000004
    const result = resolveOrderLinePrice(line({ price: 0.3 - 1e-12, quantity: 1 }), { ...storeItem, price: noisy }, null)

    expect(result).toEqual({ ok: true, price: 0.3, subtotal: 0.3 })
  })
})
