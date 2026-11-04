/**
 * The cart page's "+" and its message, told where the kitchen's stock ends
 * (client: "if 5 left and someone orders 7 it should warn"). Same numbers as
 * the product-page stepper (`resolveAddableQuantity` / `describeRemainingStock`)
 * and checkout's guard, which stays the hard refusal. `null` ceiling =
 * untracked or unknown (no branch shelf row, never counted) = exactly today.
 */
import { canAddMoreOfDish, countDishInCart, describeCartLineStock } from '@/lib/inventory/cart-stock-caps'

const line = (menuItemId: string, quantity: number) => ({ menu_item: { id: menuItemId }, quantity })

describe('countDishInCart', () => {
  it('adds every line of the same dish (different sizes share one shelf)', () => {
    expect(countDishInCart([line('a', 2), line('b', 1), line('a', 3)], 'a')).toBe(5)
    expect(countDishInCart([], 'a')).toBe(0)
  })
})

describe('canAddMoreOfDish', () => {
  it('is always true for an untracked dish', () => {
    expect(canAddMoreOfDish(null, 99)).toBe(true)
  })

  it('stops at the ceiling', () => {
    expect(canAddMoreOfDish(5, 4)).toBe(true)
    expect(canAddMoreOfDish(5, 5)).toBe(false)
    expect(canAddMoreOfDish(5, 7)).toBe(false)
    expect(canAddMoreOfDish(0, 0)).toBe(false)
  })
})

describe('describeCartLineStock', () => {
  it('says nothing for an untracked dish or plenty left', () => {
    expect(describeCartLineStock(null, 3)).toBeNull()
    expect(describeCartLineStock(50, 3)).toBeNull()
  })

  it('says how many more can be added when few remain', () => {
    expect(describeCartLineStock(5, 3)).toBe('Only 2 left')
  })

  it('says so when the cart already holds every one the kitchen can make', () => {
    expect(describeCartLineStock(5, 5)).toBe('That’s all we can make today')
  })

  it('warns when the cart holds more than the kitchen can make (5 left, 7 in the cart)', () => {
    expect(describeCartLineStock(5, 7)).toBe('Only 5 left — lower to 5 to check out')
  })

  it('says sold out when none can be made', () => {
    expect(describeCartLineStock(0, 2)).toBe('Sold out')
  })
})
