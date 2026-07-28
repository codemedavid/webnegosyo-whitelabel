/**
 * Out-of-stock dishes stay on the menu.
 *
 * `is_available = false` used to mean "delete this from the customer's view":
 * the storefront query filtered the row out entirely, so the "Unavailable"
 * overlay every card template already renders was unreachable code. A merchant
 * who ran out of pork had no way to say so — the dish simply disappeared, and
 * customers assumed it was off the menu for good.
 *
 * The flag now means "out of stock": still listed, still visible, not orderable.
 * That makes orderability a decision rather than a query filter, and this is
 * the one place that decision is made.
 */

import { isMenuItemOrderable } from '@/lib/menu-item-availability'

describe('isMenuItemOrderable', () => {
  it('lets a customer order a dish that is in stock', () => {
    expect(isMenuItemOrderable({ is_available: true })).toBe(true)
  })

  it('refuses a dish the merchant marked out of stock', () => {
    expect(isMenuItemOrderable({ is_available: false })).toBe(false)
  })

  /*
   * Several call sites project a narrower column list than the full row. A
   * caller whose query omitted `is_available` must not silently turn every
   * dish on the menu unorderable — the blank menu that would cause is worse
   * than the rare over-permissive add, which the cart refresh already catches.
   */
  it('treats a dish whose availability was never selected as orderable', () => {
    expect(isMenuItemOrderable({})).toBe(true)
    expect(isMenuItemOrderable({ is_available: undefined })).toBe(true)
  })

  it('treats a NULL availability column as orderable', () => {
    expect(isMenuItemOrderable({ is_available: null })).toBe(true)
  })
})
