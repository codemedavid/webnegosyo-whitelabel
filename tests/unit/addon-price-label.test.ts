import { describe, it, expect } from '@jest/globals'
import { addonPriceLabel, addonPriceList } from '@/lib/addon-quantity'

/**
 * Cart, checkout and the Messenger message used to show add-ons as names only
 * ("Fried Rice ×2"), so a customer saw ₱130 on a ₱100 dish with nothing to
 * explain the ₱30. The label now carries what the add-on adds to ONE dish.
 */

const peso = (amount: number): string => `₱${amount.toFixed(2)}`

describe('addonPriceLabel', () => {
  it('adds the price of every portion to the label', () => {
    expect(addonPriceLabel({ name: 'Fried Rice', price: 15, quantity: 2 }, peso)).toBe('Fried Rice ×2 (+₱30.00)')
  })

  it('treats a missing quantity as one portion', () => {
    expect(addonPriceLabel({ name: 'Egg', price: 20 }, peso)).toBe('Egg (+₱20.00)')
  })

  it.each([
    ['free', 0],
    ['unknown', null],
    ['missing', undefined],
    ['not a number', Number.NaN],
  ])('shows just the name when the price is %s', (_label, price) => {
    expect(addonPriceLabel({ name: 'Gravy', price: price as number | null | undefined }, peso)).toBe('Gravy')
  })

  it('joins a list in order', () => {
    expect(addonPriceList([{ name: 'Fried Rice', price: 15, quantity: 2 }, { name: 'Gravy', price: 0 }], peso))
      .toBe('Fried Rice ×2 (+₱30.00), Gravy')
  })
})
