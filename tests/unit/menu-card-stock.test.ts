/**
 * What a storefront menu card says about stock (client complaint 2026-11-04:
 * "it should say out of stock"). The ceiling is how many the kitchen can make
 * right now (`/api/inventory/ceilings`): `null` = untracked / unknown, which
 * must look exactly like today. Thresholds are the stepper's own
 * (`STOCK_HINT_THRESHOLD`), so the card and the stepper never disagree.
 */
import { isMenuItemOrderable, resolveMenuCardStock as resolve } from '@/lib/menu-item-availability'
import { STOCK_HINT_THRESHOLD } from '@/lib/inventory/stepper-cap'

const ON = { is_available: true }
const OFF = { is_available: false }
const resolveMenuCardStock = (item: { is_available?: boolean }, ceiling: number | null) =>
  resolve(isMenuItemOrderable(item), ceiling)

describe('resolveMenuCardStock', () => {
  it('leaves an untracked dish exactly as it was', () => {
    expect(resolveMenuCardStock(ON, null)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: null })
    expect(resolveMenuCardStock({}, null)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: null })
  })

  it('marks a dish the kitchen can make 0 times as sold out, even while it is switched on', () => {
    expect(resolveMenuCardStock(ON, 0)).toEqual({ isOrderable: false, isSoldOut: true, onlyLeft: null })
    expect(resolveMenuCardStock(ON, -3)).toEqual({ isOrderable: false, isSoldOut: true, onlyLeft: null })
  })

  it('says "only N left" when few remain', () => {
    expect(resolveMenuCardStock(ON, 5)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: 5 })
    expect(resolveMenuCardStock(ON, STOCK_HINT_THRESHOLD)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: STOCK_HINT_THRESHOLD })
  })

  it('stays quiet when plenty remain', () => {
    expect(resolveMenuCardStock(ON, STOCK_HINT_THRESHOLD + 1)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: null })
  })

  it('a dish switched off stays "unavailable" as today, whatever the stock says', () => {
    expect(resolveMenuCardStock(OFF, 5)).toEqual({ isOrderable: false, isSoldOut: false, onlyLeft: null })
    expect(resolveMenuCardStock(OFF, 0)).toEqual({ isOrderable: false, isSoldOut: false, onlyLeft: null })
    expect(resolveMenuCardStock(OFF, null)).toEqual({ isOrderable: false, isSoldOut: false, onlyLeft: null })
  })

  it('counts only whole dishes', () => {
    expect(resolveMenuCardStock(ON, 2.7)).toEqual({ isOrderable: true, isSoldOut: false, onlyLeft: 2 })
    expect(resolveMenuCardStock(ON, 0.4)).toEqual({ isOrderable: false, isSoldOut: true, onlyLeft: null })
  })
})
