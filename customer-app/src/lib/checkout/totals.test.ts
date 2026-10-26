import { checkoutTotals, minimumOrderShortfall } from './totals'

describe('checkoutTotals', () => {
  it('adds the delivery fee and takes the discount off the food', () => {
    expect(checkoutTotals({ subtotalCentavos: 48500, discountCentavos: 4850, deliveryFeeCentavos: 4900 })).toEqual({
      subtotalCentavos: 48500,
      discountCentavos: 4850,
      deliveryFeeCentavos: 4900,
      totalCentavos: 48550,
    })
  })

  it('never discounts below zero food, and never discounts the delivery fee', () => {
    const totals = checkoutTotals({ subtotalCentavos: 9500, discountCentavos: 20000, deliveryFeeCentavos: 4900 })
    expect(totals.discountCentavos).toBe(9500)
    expect(totals.totalCentavos).toBe(4900)
  })

  it('treats a negative discount or fee as none', () => {
    const totals = checkoutTotals({ subtotalCentavos: 10000, discountCentavos: -50, deliveryFeeCentavos: -1 })
    expect(totals.totalCentavos).toBe(10000)
  })
})

describe('minimumOrderShortfall', () => {
  it('is how much more food is needed to reach the minimum', () => {
    expect(minimumOrderShortfall(24000, 300)).toBe(6000)
  })

  it('is zero once the minimum is met or when there is none', () => {
    expect(minimumOrderShortfall(30000, 300)).toBe(0)
    expect(minimumOrderShortfall(100, 0)).toBe(0)
    expect(minimumOrderShortfall(100, undefined)).toBe(0)
  })
})
